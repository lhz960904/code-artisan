import type { Message, AssistantMessage, ToolMessage, ToolUseContent, UserMessage, NonSystemMessage } from "../types/messages";
import { LLMProvider } from "../types/provider";
import type { AgentOptions, AgentContext, AgentMiddleware } from "../types";
import type { Tool } from "../tools/tool";

const DEFAULT_MAX_ITERATIONS = 100;

export class Agent {
  private model: LLMProvider;
  private tools: Tool[];
  private middlewares: AgentMiddleware[];
  private maxSteps: number;
  private agentContext: AgentContext;
  private systemPrompt: string;
  private messages: Message[] = [];

  private _running: boolean = false;
  private _abortController: AbortController | null = null;

  constructor(params: AgentOptions) {
    this.systemPrompt = params.prompt;
    this.model = params.model;
    this.tools = params.tools ?? [];
    this.middlewares = params.middlewares ?? [];
    this.maxSteps = params.maxSteps ?? DEFAULT_MAX_ITERATIONS;

    this.agentContext = {
      prompt: this.systemPrompt,
      messages: this.messages,
      tools: this.tools,
    };
  }

  private _appendMessage(message: NonSystemMessage) {
    this.messages.push(message);
  }

  async *invoke(message: UserMessage): AsyncGenerator<AssistantMessage | ToolMessage> {
    if (this._running) {
      throw new Error("Agent is already running");
    }
    this._abortController = new AbortController();
    this._appendMessage(message);
    await this._beforeAgentRun();
    this._running = true;
    try {
      for (let step = 1; step <= this.maxSteps; step++) {
        this._abortController.signal.throwIfAborted();
        await this._beforeAgentStep(step);
        const assistantMessage = await this._think();
        yield assistantMessage;

        const toolUses = this._extractToolUses(assistantMessage);
        if (toolUses.length === 0) {
          await this._afterAgentRun();
          return;
        }

        yield* this._act(toolUses);
        await this._afterAgentStep(step);
      }
      throw new Error("Maximum number of steps reached");
    } finally {
      this._running = false;
      this._abortController = null;
    }
  }

  /** model invocation */
  private async _think(): Promise<AssistantMessage> {
    await this._beforeModel();
    const messages: Message[] = [];
    if (this.systemPrompt) {
      messages.push({ role: "system", content: [{ type: "text", text: this.systemPrompt }] });
    }
    messages.push(...this.messages);
    const message = await this.model.invoke({
      messages: messages,
      tools: this.tools,
      signal: this._abortController?.signal,
    });
    this._appendMessage(message);
    await this._afterModel(message);
    return message;
  }

  /** tool use execution */
  private async *_act(toolUses: ToolUseContent[]): AsyncGenerator<ToolMessage> {
    const signal = this._abortController?.signal;
    // execute tool uses concurrently
    const pending = toolUses.map(async (toolUse, index) => {
      try {
        const tool = this.tools?.find((t) => t.name === toolUse.name);
        if (!tool) throw new Error(`Tool ${toolUse.name} not found`);
        await this._beforeToolUse(toolUse);
        const result = await tool.invoke(toolUse.input, signal);
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

  private async _beforeModel() {
    for (const middleware of this.middlewares) {
      if (!middleware.beforeModel) continue;
      const result = await middleware.beforeModel({ agentContext: this.agentContext });
      if (result) {
        Object.assign(this.agentContext, result);
      }
    }
  }

  private async _afterModel(message: AssistantMessage) {
    for (const middleware of this.middlewares) {
      if (!middleware.afterModel) continue;
      const result = await middleware.afterModel({ agentContext: this.agentContext, message });
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
