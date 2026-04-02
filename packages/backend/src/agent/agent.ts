import { MessageStore } from "../services/message-store.js";
import { eventBus } from "../services/event-bus.js";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getSandboxProvider } from "../sandbox/index.js";
import { toolRegistry } from "../tools/index.js";
import type { AgentConfig, AgentMiddleware, AgentRuntime, LLMProvider, LLMResponse, ThinkingBlock, ToolCall } from "./types.js";
import type { Message, MessagePart, ToolCallPart } from "@code-artisan/shared";

function buildSystemPrompt(): string {
  const toolSection = toolRegistry.toPromptSection();
  return `You are an AI coding agent running in a sandboxed Linux environment. You help users write code, execute commands, and build projects.

You have access to these tools:
${toolSection}

Always use tools to interact with the filesystem. When the user asks you to write code, use write_file to create the file, then bash to run it. For web servers, use start_server to launch them and provide the preview URL. Use str_replace to make targeted edits to existing files instead of rewriting the entire file. Be concise in your text responses.`;
}

/** Track running agents by conversationId for external abort */
const runningAgents = new Map<string, AbortController>();

export function stopAgent(conversationId: string): boolean {
  const ac = runningAgents.get(conversationId);
  if (!ac) return false;
  ac.abort();
  return true;
}

export class Agent {
  private provider: LLMProvider;
  private middlewares: AgentMiddleware[];

  constructor(provider: LLMProvider, middlewares: AgentMiddleware[] = []) {
    this.provider = provider;
    this.middlewares = middlewares;
  }

  // --- Public API ---

  async run(config: AgentConfig): Promise<void> {
    const { conversationId, userParts, maxIterations = 10 } = config;

    const ac = new AbortController();
    runningAgents.set(conversationId, ac);

    let runtime: AgentRuntime | null = null;

    try {
      runtime = await this.initRuntime(conversationId);

      // Check abort signal before each major step
      const checkAbort = () => {
        if (ac.signal.aborted) {
          runtime!.shouldStop = true;
        }
      };

      await this.runHook("beforeAgent", runtime);

      if (userParts && userParts.length > 0) {
        await this.addMessage(runtime, "user", userParts);
      }

      await this.handlePendingConfirm(runtime);

      for (let i = 0; i < maxIterations && !runtime.shouldStop; i++) {
        checkAbort();
        if (runtime.shouldStop) break;

        await this.runHook("beforeModel", runtime);
        if (runtime.shouldStop) break;

        const response = await this.callModel(runtime);

        checkAbort();
        await this.runHook("afterModel", runtime, response);
        if (runtime.shouldStop) break;

        runtime.usage.inputTokens += response.usage.inputTokens;
        runtime.usage.outputTokens += response.usage.outputTokens;

        await this.persistAssistantMessage(runtime, response, i);

        if (response.stopReason !== "tool_calls") break;

        try {
          await this.handleToolCalls(runtime, response.toolCalls);
          await this.runHook("afterToolExecution", runtime);
        } catch (toolErr) {
          console.error(`[agent] Tool execution error:`, toolErr);
          await this.runHook("onError", runtime, toolErr as Error);
          const errMsg = `Tool execution failed: ${String(toolErr)}`;
          await this.addMessage(runtime, "assistant", [{ type: "error", message: errMsg }]);
          runtime.emitStream({ type: "error", error: errMsg });
        }
      }

      await this.runHook("afterAgent", runtime);
    } catch (err) {
      console.error(`[agent] Fatal error in conversation ${conversationId}:`, err);
      await this.runHook("onError", runtime!, err as Error).catch(() => {});
      if (runtime) {
        try {
          const errMsg = String(err);
          await this.addMessage(runtime, "assistant", [{ type: "error", message: errMsg }]);
          runtime.emitStream({ type: "error", error: errMsg });
        } catch {
          // persist failed, just log
        }
      }
    } finally {
      runningAgents.delete(conversationId);
      eventBus.emitStream(conversationId, { type: "stream-finish" });
    }
  }

  // --- Runtime Init ---

  private async initRuntime(conversationId: string): Promise<AgentRuntime> {
    const store = new MessageStore(conversationId);

    const [conv] = await db.select({ mode: conversations.mode }).from(conversations).where(eq(conversations.id, conversationId));

    const sandbox = await this.getOrCreateSandbox(conversationId, store);
    const messages = await store.getMessages();

    return {
      sandbox,
      conversationId,
      messages,
      mode: (conv?.mode as "yolo" | "confirm") ?? "yolo",
      state: new Map(),
      store,
      provider: this.provider,
      emitStream: (data) => eventBus.emitStream(conversationId, data),
      usage: { inputTokens: 0, outputTokens: 0 },
      shouldStop: false,
    };
  }

  private async getOrCreateSandbox(conversationId: string, store: MessageStore) {
    const provider = getSandboxProvider();

    const [conv] = await db.select({ sandboxId: conversations.sandboxId }).from(conversations).where(eq(conversations.id, conversationId));

    const sandbox = await provider.acquire(conv?.sandboxId ?? undefined);

    if (sandbox.id !== conv?.sandboxId) {
      const snapshots = await store.getFileSnapshots();
      if (snapshots.length > 0) {
        await provider.restoreFiles(sandbox, snapshots);
      }
      await db.update(conversations).set({ sandboxId: sandbox.id }).where(eq(conversations.id, conversationId));
    }

    return sandbox;
  }

  // --- LLM Call ---

  private async callModel(runtime: AgentRuntime): Promise<LLMResponse> {
    const model = "anthropic/claude-opus-4.6";
    const stream = this.provider.stream({
      model,
      system: buildSystemPrompt(),
      messages: runtime.messages,
      tools: toolRegistry.toToolDefinitions(),
    });

    let textContent = "";
    const thinkingBlocks: ThinkingBlock[] = [];
    const toolCalls: ToolCall[] = [];
    let stopReason = "stop";
    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const event of stream) {
      if (event.type !== "stream-finish") {
        runtime.emitStream(event);
      }
      switch (event.type) {
        case "thinking-end":
          thinkingBlocks.push({ thinking: event.text, signature: event.signature });
          break;
        case "text-end":
          textContent = event.text;
          break;
        case "tool-input-end":
          toolCalls.push({ id: event.toolCallId, name: event.toolName, input: JSON.parse(event.text || "{}") });
          break;
        case "step-finish":
          stopReason = event.finishReason;
          usage = event.usage;
          break;
      }
    }

    return { textContent, thinkingBlocks, toolCalls, stopReason, usage, model };
  }

  // --- Assistant Message ---

  private async persistAssistantMessage(runtime: AgentRuntime, response: LLMResponse, stepIndex: number): Promise<void> {
    const parts: MessagePart[] = [];
    for (const tb of response.thinkingBlocks) {
      parts.push({ type: "thinking", thinking: tb.thinking, signature: tb.signature });
    }
    if (response.textContent) parts.push({ type: "text", text: response.textContent });
    parts.push({
      type: "step-end",
      stepIndex,
      usage: response.usage,
      finishReason: response.stopReason,
      model: response.model,
    });

    await this.addMessage(runtime, "assistant", parts);
  }

  // --- Tool Execution ---

  private async handleToolCalls(runtime: AgentRuntime, toolCalls: ToolCall[]): Promise<void> {
    const toolMsgIds: Array<{ msgId: string; tc: ToolCall }> = [];
    for (const tc of toolCalls) {
      const toolPart: ToolCallPart = {
        type: "tool-call",
        toolCallId: tc.id,
        toolName: tc.name,
        input: tc.input,
        state: "call",
      };
      const toolMsg = await this.addMessage(runtime, "tool", [toolPart]);
      toolMsgIds.push({ msgId: toolMsg.id, tc });
    }

    const [currentConv] = await db.select({ mode: conversations.mode }).from(conversations).where(eq(conversations.id, runtime.conversationId));
    runtime.mode = (currentConv?.mode as "yolo" | "confirm") ?? "yolo";

    if (runtime.mode === "confirm" && toolMsgIds.length > 0) {
      await runtime.store.updatePart(toolMsgIds[0].msgId, 0, { approval: "pending" });
      runtime.emitStream({
        type: "tool-approval",
        toolCallId: toolMsgIds[0].tc.id,
        toolName: toolMsgIds[0].tc.name,
        approval: "pending",
      });
      runtime.shouldStop = true;
      return;
    }

    const results = await Promise.allSettled(toolCalls.map((tc) => this.executeTool(runtime, tc)));

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const { msgId } = toolMsgIds[i];
      const result = results[i];
      const output = result.status === "fulfilled" ? result.value : `Error: ${result.reason}`;
      const state = result.status === "fulfilled" ? ("result" as const) : ("error" as const);

      await runtime.store.updatePart(msgId, 0, { state, output });

      const inMemoryMsg = runtime.messages.find((m) => m.id === msgId);
      if (inMemoryMsg) {
        const part = inMemoryMsg.parts[0] as ToolCallPart;
        part.state = state;
        part.output = output;
      }

      runtime.emitStream({
        type: "tool-output",
        toolCallId: tc.id,
        toolName: tc.name,
        state,
        output,
      });

      await this.handleToolSideEffects(runtime, tc);
    }
  }

  private async executeTool(runtime: AgentRuntime, tc: ToolCall): Promise<string> {
    const tool = toolRegistry.get(tc.name);
    if (!tool) return `Error: Unknown tool: ${tc.name}`;
    return tool.call({ sandbox: runtime.sandbox, conversationId: runtime.conversationId }, tc.input);
  }

  private async handleToolSideEffects(runtime: AgentRuntime, tc: ToolCall): Promise<void> {
    if (tc.name === "write_file") {
      const input = tc.input as { path: string; content: string };
      await runtime.store.upsertFileSnapshot(input.path, input.content);
    }
    if (tc.name === "start_server") {
      const port = Number(tc.input.port) || 3000;
      const url = runtime.sandbox.getHostUrl(port);
      await this.addMessage(runtime, "assistant", [{ type: "text", text: `Preview URL: ${url}` }], {
        previewUrl: url,
        port,
      });
    }
  }

  // --- Confirm Mode ---

  private async handlePendingConfirm(runtime: AgentRuntime): Promise<void> {
    if (runtime.messages.length < 2) return;

    const lastConfirmMsg = [...runtime.messages].reverse().find((m) => m.metadata?.confirmResponse != null);
    if (!lastConfirmMsg) return;

    const approved = (lastConfirmMsg.metadata as { confirmResponse: { approved: boolean } }).confirmResponse.approved;

    const pendingToolMsg = [...runtime.messages]
      .reverse()
      .find((m) => m.role === "tool" && m.parts.some((p) => p.type === "tool-call" && p.approval === "pending"));
    if (!pendingToolMsg) return;

    const pendingPart = pendingToolMsg.parts.find((p): p is ToolCallPart => p.type === "tool-call" && p.approval === "pending");
    if (!pendingPart) return;

    const tc: ToolCall = {
      id: pendingPart.toolCallId,
      name: pendingPart.toolName,
      input: pendingPart.input,
    };

    if (approved) {
      const output = await this.executeTool(runtime, tc);
      await runtime.store.updatePart(pendingToolMsg.id, 0, {
        state: "result",
        output,
        approval: "approved",
      });
      runtime.emitStream({
        type: "tool-approval",
        toolCallId: tc.id,
        toolName: tc.name,
        approval: "approved",
      });
      runtime.emitStream({
        type: "tool-output",
        toolCallId: tc.id,
        toolName: tc.name,
        state: "result",
        output,
      });
      await this.handleToolSideEffects(runtime, tc);
    } else {
      await runtime.store.updatePart(pendingToolMsg.id, 0, {
        state: "error",
        output: "User rejected this tool call.",
        approval: "rejected",
      });
      runtime.emitStream({
        type: "tool-approval",
        toolCallId: tc.id,
        toolName: tc.name,
        approval: "rejected",
      });
      runtime.emitStream({
        type: "tool-output",
        toolCallId: tc.id,
        toolName: tc.name,
        state: "error",
        output: "User rejected this tool call.",
      });
    }
  }

  // --- Helpers ---

  private async addMessage(runtime: AgentRuntime, role: Message["role"], parts: MessagePart[], metadata?: Record<string, unknown>): Promise<Message> {
    const row = await runtime.store.addMessage(role, parts, metadata);
    const msg: Message = {
      id: row.id,
      role,
      parts,
      metadata,
      createdAt: new Date().toISOString(),
    };
    runtime.messages.push(msg);
    return msg;
  }

  private async runHook(hook: keyof Omit<AgentMiddleware, "name">, runtime: AgentRuntime, ...args: unknown[]): Promise<void> {
    for (const mw of this.middlewares) {
      const fn = mw[hook];
      if (!fn) continue;
      await (fn as Function).call(mw, runtime, ...args);
    }
  }
}
