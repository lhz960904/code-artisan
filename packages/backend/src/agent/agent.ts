import Anthropic from "@anthropic-ai/sdk";
import { ClaudeService, toAnthropicMessages } from "../services/claude.js";
import { MessageStore } from "../services/message-store.js";
import { eventBus } from "../services/event-bus.js";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getSandboxProvider } from "../sandbox/index.js";
import { toolRegistry } from "../tools/index.js";
import type { AgentConfig, AgentMiddleware, AgentRuntime, LLMResponse, ToolCall } from "./types.js";
import { getToolCalls, getTextContent, getThinking, hasToolCalls } from "./types.js";
import type { Message, MessagePart, ToolCallPart } from "@code-artisan/shared";

export class Agent {
  private middlewares: AgentMiddleware[];
  private claude: ClaudeService;

  constructor(middlewares: AgentMiddleware[] = []) {
    this.middlewares = middlewares;
    this.claude = new ClaudeService();
  }

  // --- Public API ---

  async run(config: AgentConfig): Promise<void> {
    const { conversationId, userMessage, maxIterations = 10 } = config;

    let runtime: AgentRuntime | null = null;

    try {
      runtime = await this.initRuntime(conversationId);

      await this.runHook("beforeAgent", runtime);

      // Write user message
      if (userMessage) {
        await this.addMessage(runtime, "user", [{ type: "text", text: userMessage }]);
      }

      // Handle pending confirm (if resuming after approval/rejection)
      await this.handlePendingConfirm(runtime);

      for (let i = 0; i < maxIterations && !runtime.shouldStop; i++) {
        await this.runHook("beforeModel", runtime);

        if (runtime.shouldStop) break;

        // Call LLM (converts messages to Anthropic format internally)
        const response = await this.callModel(runtime);

        await this.runHook("afterModel", runtime, response);

        if (runtime.shouldStop) break;

        // Accumulate usage
        runtime.usage.inputTokens += response.usage.input_tokens;
        runtime.usage.outputTokens += response.usage.output_tokens;

        // Build and persist assistant message (text + thinking + step-end)
        await this.persistAssistantMessage(runtime, response, i);

        // Pure text response → done
        if (!hasToolCalls(response)) break;

        // Handle tool calls
        const toolCalls = getToolCalls(response);
        await this.handleToolCalls(runtime, toolCalls);
      }

      await this.runHook("afterAgent", runtime);
    } catch (err) {
      console.error(`[agent] Error in conversation ${conversationId}:`, err);
      if (runtime) {
        try {
          await this.addMessage(runtime, "assistant", [{ type: "error", message: String(err) }]);
        } catch {
          // If persist fails too, just log
        }
      }
    } finally {
      eventBus.emitDone(conversationId);
    }
  }

  // --- Runtime Init ---

  private async initRuntime(conversationId: string): Promise<AgentRuntime> {
    const store = new MessageStore(conversationId);

    const [conv] = await db
      .select({ mode: conversations.mode })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    const sandbox = await this.getOrCreateSandbox(conversationId, store);
    const messages = await store.getMessages();

    return {
      sandbox,
      conversationId,
      messages,
      mode: (conv?.mode as "yolo" | "confirm") ?? "yolo",
      state: new Map(),
      store,
      emitStream: (data) => eventBus.emitStream(conversationId, data),
      usage: { inputTokens: 0, outputTokens: 0 },
      shouldStop: false,
    };
  }

  private async getOrCreateSandbox(conversationId: string, store: MessageStore) {
    const provider = getSandboxProvider();

    const [conv] = await db
      .select({ sandboxId: conversations.sandboxId })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    const sandbox = await provider.acquire(conv?.sandboxId ?? undefined);

    if (sandbox.id !== conv?.sandboxId) {
      const snapshots = await store.getFileSnapshots();
      if (snapshots.length > 0) {
        await provider.restoreFiles(sandbox, snapshots);
      }
      await db
        .update(conversations)
        .set({ sandboxId: sandbox.id })
        .where(eq(conversations.id, conversationId));
    }

    return sandbox;
  }

  // --- LLM Call ---

  private async callModel(runtime: AgentRuntime): Promise<LLMResponse> {
    const msgId = `stream_${Date.now()}`;

    // Convert our Message[] to Anthropic format only at the call boundary
    const anthropicMessages = toAnthropicMessages(runtime.messages);

    const response = await this.claude.chatStream(anthropicMessages, (text) => {
      runtime.emitStream({
        messageId: msgId,
        type: "text-delta",
        textDelta: text,
      });
    });

    return response;
  }

  // --- Assistant Message ---

  private async persistAssistantMessage(
    runtime: AgentRuntime,
    response: LLMResponse,
    stepIndex: number,
  ): Promise<void> {
    const textContent = getTextContent(response);
    const thinking = getThinking(response);

    const parts: MessagePart[] = [];
    if (thinking) parts.push({ type: "thinking", thinking });
    if (textContent) parts.push({ type: "text", text: textContent });
    parts.push({
      type: "step-end",
      stepIndex,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      finishReason: response.stop_reason ?? "end_turn",
      model: response.model,
    });

    await this.addMessage(runtime, "assistant", parts);
  }

  // --- Tool Execution ---

  private async handleToolCalls(runtime: AgentRuntime, toolCalls: ToolCall[]): Promise<void> {
    // Create tool messages (one per tool call, state="call")
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

    // Re-check mode
    const [currentConv] = await db
      .select({ mode: conversations.mode })
      .from(conversations)
      .where(eq(conversations.id, runtime.conversationId));
    runtime.mode = (currentConv?.mode as "yolo" | "confirm") ?? "yolo";

    // Confirm mode: set approval=pending on first tool message, stop
    if (runtime.mode === "confirm" && toolMsgIds.length > 0) {
      await runtime.store.updatePart(toolMsgIds[0].msgId, 0, { approval: "pending" });
      this.emitPart(runtime, toolMsgIds[0].msgId, {
        type: "tool-call",
        toolCallId: toolMsgIds[0].tc.id,
        toolName: toolMsgIds[0].tc.name,
        input: toolMsgIds[0].tc.input,
        state: "call",
        approval: "pending",
      });
      runtime.shouldStop = true;
      return;
    }

    // Yolo mode: execute all tools in parallel
    const results = await Promise.allSettled(
      toolCalls.map((tc) => this.executeTool(runtime, tc)),
    );

    // Update each tool message's part (state: call → result)
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const { msgId } = toolMsgIds[i];
      const result = results[i];
      const output = result.status === "fulfilled" ? result.value : `Error: ${result.reason}`;
      const state = result.status === "fulfilled" ? ("result" as const) : ("error" as const);

      await runtime.store.updatePart(msgId, 0, { state, output });
      this.emitPart(runtime, msgId, {
        type: "tool-call",
        toolCallId: tc.id,
        toolName: tc.name,
        input: tc.input,
        state,
        output,
      });

      await this.handleToolSideEffects(runtime, tc);
    }
  }

  private async executeTool(runtime: AgentRuntime, tc: ToolCall): Promise<string> {
    const tool = toolRegistry.get(tc.name);
    if (!tool) return `Error: Unknown tool: ${tc.name}`;
    return tool.call(
      { sandbox: runtime.sandbox, conversationId: runtime.conversationId },
      tc.input,
    );
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

    // Find last user message with confirm_response metadata
    const lastConfirmMsg = [...runtime.messages]
      .reverse()
      .find((m) => m.metadata?.confirmResponse != null);
    if (!lastConfirmMsg) return;

    const approved = (lastConfirmMsg.metadata as { confirmResponse: { approved: boolean } })
      .confirmResponse.approved;

    // Find the tool message with pending approval
    const pendingToolMsg = [...runtime.messages]
      .reverse()
      .find(
        (m) =>
          m.role === "tool" &&
          m.parts.some((p) => p.type === "tool-call" && p.approval === "pending"),
      );
    if (!pendingToolMsg) return;

    const pendingPart = pendingToolMsg.parts.find(
      (p): p is ToolCallPart => p.type === "tool-call" && p.approval === "pending",
    );
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
      this.emitPart(runtime, pendingToolMsg.id, {
        ...pendingPart,
        state: "result",
        output,
        approval: "approved",
      });
      await this.handleToolSideEffects(runtime, tc);
    } else {
      await runtime.store.updatePart(pendingToolMsg.id, 0, {
        state: "error",
        output: "User rejected this tool call.",
        approval: "rejected",
      });
      this.emitPart(runtime, pendingToolMsg.id, {
        ...pendingPart,
        state: "error",
        output: "User rejected this tool call.",
        approval: "rejected",
      });
    }
  }

  // --- Helpers ---

  /** Add message to store + runtime.messages + emit all parts via SSE */
  private async addMessage(
    runtime: AgentRuntime,
    role: Message["role"],
    parts: MessagePart[],
    metadata?: Record<string, unknown>,
  ): Promise<Message> {
    const row = await runtime.store.addMessage(role, parts, metadata);
    const msg: Message = {
      id: row.id,
      role,
      parts,
      metadata,
      createdAt: new Date().toISOString(),
    };
    runtime.messages.push(msg);
    for (const part of parts) {
      this.emitPart(runtime, msg.id, part);
    }
    return msg;
  }

  private emitPart(runtime: AgentRuntime, messageId: string, part: MessagePart): void {
    runtime.emitStream({ messageId, part });
  }

  private async runHook(
    hook: "beforeAgent" | "beforeModel" | "afterModel" | "afterAgent",
    runtime: AgentRuntime,
    response?: LLMResponse,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (!mw[hook]) continue;
      await mw[hook]!(runtime, response);
    }
  }
}
