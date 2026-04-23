import type {
  Message,
  AssistantMessage,
  ToolMessage,
  ToolUseContent,
  UserMessage,
  NonSystemMessage,
  AgentEvent,
  AgentMessageEvent,
} from "../types/messages";
import { LLMProvider } from "../types/provider";
import type { AgentOptions, AgentContext, ModelContext, AgentMiddleware } from "../types";
import type { Tool, ToolContext } from "../tools/tool";
import type { Sandbox } from "../sandbox/types";
import { LocalSandbox } from "../sandbox/local";

const DEFAULT_MAX_ITERATIONS = 100;

export class Agent {
  private model: LLMProvider;
  private tools: Tool[];
  private middlewares: AgentMiddleware[];
  private maxSteps: number;
  private sandbox: Sandbox;
  private agentContext: AgentContext;
  private prompt: string;
  private messages: Message[] = [];

  private _running: boolean = false;
  private _abortController: AbortController | null = null;
  private _modelOptions: Record<string, unknown> | undefined;

  constructor(params: AgentOptions) {
    this.prompt = params.prompt || "";
    this.model = params.model;
    this.tools = params.tools ?? [];
    this.middlewares = params.middlewares ?? [];
    this.maxSteps = params.maxSteps ?? DEFAULT_MAX_ITERATIONS;
    this.sandbox = params.sandbox ?? new LocalSandbox();

    this.agentContext = {
      prompt: this.prompt,
      messages: this.messages,
      model: this.model,
      tools: this.tools,
      sandbox: this.sandbox,
    };

    if (params.initMessages?.length) {
      this.messages.push(...params.initMessages);
    }
  }

  /** Request the current run to stop. No-op when no run is active. */
  abort(reason?: unknown): void {
    this._abortController?.abort(reason);
  }

  private _appendMessage(message: NonSystemMessage) {
    this.messages.push(message);
  }

  /** Run the loop and return all assistant/tool messages as one array. */
  async invoke(message: UserMessage): Promise<Array<AssistantMessage | ToolMessage>> {
    const collected: Array<AssistantMessage | ToolMessage> = [];
    for await (const { message: settled } of this.stream(message, { mode: "message" })) {
      collected.push(settled);
    }
    return collected;
  }

  /**
   * Run the loop and yield events.
   *  - `mode: "token"` (default): partial snapshots + message events
   *  - `mode: "message"`: message events only
   */
  stream(message: UserMessage, options: { mode: "message"; modelOptions?: Record<string, unknown> }): AsyncGenerator<AgentMessageEvent>;
  stream(message: UserMessage, options?: { mode?: "token"; modelOptions?: Record<string, unknown> }): AsyncGenerator<AgentEvent>;
  async *stream(message: UserMessage, options: { mode?: "token" | "message"; modelOptions?: Record<string, unknown> } = {}): AsyncGenerator<AgentEvent> {
    const mode = options.mode ?? "token";
    if (this._running) throw new Error("Agent is already running");
    this._abortController = new AbortController();
    this._modelOptions = options.modelOptions;
    this._appendMessage(message);
    await this._beforeAgentRun();
    this._running = true;
    try {
      let finished = false;
      for (let step = 1; step <= this.maxSteps; step++) {
        // Cooperative stop — a middleware (loop detection, quota, etc.)
        // can set agentContext.shouldStop to exit cleanly after the
        // previous step completes, without throwing.
        if (this.agentContext.shouldStop) {
          finished = true;
          this.abort();
          break;
        }
        this._abortController.signal.throwIfAborted();
        await this._beforeAgentStep(step);

        const assistantMessage = yield* this._thinkStream(mode);
        yield { type: "message", message: assistantMessage };

        const toolUses = this._extractToolUses(assistantMessage);
        if (toolUses.length === 0) {
          finished = true;
          break;
        }

        for await (const toolMessage of this._act(toolUses)) {
          yield { type: "message", message: toolMessage };
        }
        await this._afterAgentStep(step);
      }
      if (!finished) throw new Error("Maximum number of steps reached");
      await this._afterAgentRun();
    } finally {
      this._running = false;
      this._abortController = null;
      this._modelOptions = undefined;
    }
  }

  private _createModelContext(): ModelContext {
    return {
      prompt: this.agentContext.prompt,
      messages: [...this.agentContext.messages],
      tools: this.agentContext.tools,
    };
  }

  private _buildModelMessages(modelContext: ModelContext): Message[] {
    const messages: Message[] = [];
    if (modelContext.prompt) {
      messages.push({ role: "system", content: [{ type: "text", text: modelContext.prompt }] });
    }
    messages.push(...modelContext.messages);
    return messages;
  }

  /**
   * Streaming model invocation. In `"token"` mode
   * yields a `partial` event per provider snapshot; in `"message"` mode
   * suppresses partials. Returns the final `AssistantMessage` either way.
   */
  private async *_thinkStream(mode: "token" | "message"): AsyncGenerator<AgentEvent, AssistantMessage> {
    const modelContext = this._createModelContext();
    await this._beforeModel(modelContext);

    let lastSnapshot: AssistantMessage | null = null;
    for await (const snapshot of this.model.stream({
      messages: this._buildModelMessages(modelContext),
      tools: modelContext.tools,
      options: this._modelOptions,
      signal: this._abortController?.signal,
    })) {
      lastSnapshot = snapshot;
      if (mode === "token") yield { type: "partial", message: snapshot };
    }
    if (!lastSnapshot) throw new Error("Model produced no output");

    this._appendMessage(lastSnapshot);
    await this._afterModel(modelContext, lastSnapshot);
    return lastSnapshot;
  }

  /** tool use execution */
  private async *_act(toolUses: ToolUseContent[]): AsyncGenerator<ToolMessage> {
    const signal = this._abortController?.signal;
    const toolContext: ToolContext = { sandbox: this.sandbox, signal };
    // execute tool uses concurrently
    const pending = toolUses.map(async (toolUse, index) => {
      try {
        const tool = this.agentContext.tools?.find((t) => t.name === toolUse.name);
        if (!tool) throw new Error(`Tool ${toolUse.name} not found`);
        await this._beforeToolUse(toolUse);
        const result = await tool.invoke(toolUse.input, toolContext);
        await this._afterToolUse(toolUse, result);
        return { index, toolUseId: toolUse.id, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { index, toolUseId: toolUse.id, result: `Error: ${message}` };
      }
    });

    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        })
      : null;

    const remaining = new Set(pending.map((_, i) => i));
    while (remaining.size > 0) {
      const candidates = [...remaining].map((i) => pending[i]);
      const resolved = (await (abortPromise ? Promise.race([...candidates, abortPromise]) : Promise.race(candidates)))!;
      remaining.delete(resolved.index);

      const toolMessage: ToolMessage = {
        role: "tool",
        content: [
          {
            type: "tool_result",
            tool_use_id: resolved.toolUseId,
            content: stringifyToolResult(resolved.result),
          },
        ],
      };
      this._appendMessage(toolMessage);
      yield toolMessage;
    }
  }

  private _extractToolUses(message: AssistantMessage): ToolUseContent[] {
    return message.content.filter((content): content is ToolUseContent => content.type === "tool_use");
  }

  private async _beforeAgentRun() {
    for (const middleware of this.middlewares) {
      if (!middleware.beforeAgentRun) continue;
      const result = await middleware.beforeAgentRun({ agentContext: this.agentContext });
      if (result) {
        Object.assign(this.agentContext, result);
      }
    }
  }

  private async _afterAgentRun() {
    for (const middleware of this.middlewares) {
      if (!middleware.afterAgentRun) continue;
      const result = await middleware.afterAgentRun({ agentContext: this.agentContext });
      if (result) {
        Object.assign(this.agentContext, result);
      }
    }
  }

  private async _beforeAgentStep(step: number) {
    for (const middleware of this.middlewares) {
      if (!middleware.beforeAgentStep) continue;
      const result = await middleware.beforeAgentStep({ agentContext: this.agentContext, step });
      if (result) {
        Object.assign(this.agentContext, result);
      }
    }
  }

  private async _afterAgentStep(step: number) {
    for (const middleware of this.middlewares) {
      if (!middleware.afterAgentStep) continue;
      const result = await middleware.afterAgentStep({ agentContext: this.agentContext, step });
      if (result) {
        Object.assign(this.agentContext, result);
      }
    }
  }

  private async _beforeModel(modelContext: ModelContext) {
    for (const middleware of this.middlewares) {
      if (!middleware.beforeModel) continue;
      const result = await middleware.beforeModel({ agentContext: this.agentContext, modelContext });
      if (result) {
        Object.assign(modelContext, result);
      }
    }
  }

  private async _afterModel(modelContext: ModelContext, message: AssistantMessage) {
    for (const middleware of this.middlewares) {
      if (!middleware.afterModel) continue;
      const result = await middleware.afterModel({ agentContext: this.agentContext, modelContext, message });
      if (result) {
        Object.assign(message, result);
      }
    }
  }

  private async _beforeToolUse(toolUse: ToolUseContent) {
    for (const middleware of this.middlewares) {
      if (!middleware.beforeToolUse) continue;
      const result = await middleware.beforeToolUse({ agentContext: this.agentContext, toolUse });
      if (result) {
        Object.assign(this.agentContext, result);
      }
    }
  }

  private async _afterToolUse(toolUse: ToolUseContent, toolResult: unknown) {
    for (const middleware of this.middlewares) {
      if (!middleware.afterToolUse) continue;
      const result = await middleware.afterToolUse({ agentContext: this.agentContext, toolUse, toolResult });
      if (result) {
        Object.assign(this.agentContext, result);
      }
    }
  }
}

function stringifyToolResult(result: unknown): string {
  if (result === undefined) return "undefined";
  if (result === null) return "null";
  if (typeof result === "object") return JSON.stringify(result);
  return String(result);
}
