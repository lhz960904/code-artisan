import Anthropic from "@anthropic-ai/sdk";
import { ClaudeService } from "../services/claude.js";
import { EventStore } from "../services/event-store.js";
import { eventBus } from "../services/event-bus.js";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getSandboxProvider } from "../sandbox/index.js";
import { toolRegistry } from "../tools/index.js";
import type { AgentConfig, AgentMiddleware, AgentRuntime, LLMResponse, ToolCall } from "./types.js";
import { getToolCalls, getTextContent, hasToolCalls } from "./types.js";
import type { ToolCallData, ToolResultData, ConfirmRequiredData, ConfirmResponseData } from "@code-artisan/shared";

type EventData = ToolCallData | ToolResultData | ConfirmRequiredData | ConfirmResponseData | { content: string } | { url: string; port: number };

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
        await this.persistAndEmit(runtime, "user_message", { content: userMessage });
        runtime.messages.push({ role: "user", content: userMessage });
      }

      // Handle pending confirm (if resuming after approval/rejection)
      await this.handlePendingConfirm(runtime);

      for (let i = 0; i < maxIterations && !runtime.shouldStop; i++) {
        await this.runHook("beforeModel", runtime);

        if (runtime.shouldStop) break;

        // Stream LLM call
        const response = await this.callModel(runtime);

        await this.runHook("afterModel", runtime, response);

        if (runtime.shouldStop) break;

        // Accumulate usage
        runtime.usage.inputTokens += response.usage.input_tokens;
        runtime.usage.outputTokens += response.usage.output_tokens;

        const textContent = getTextContent(response);

        // Pure text response → persist and finish
        if (!hasToolCalls(response)) {
          await this.persistAndEmit(runtime, "ai_text", { content: textContent });
          break;
        }

        // Tool use response — persist text content first
        if (textContent) {
          await this.persistAndEmit(runtime, "ai_text", { content: textContent });
        }

        // Handle tool calls (parallel execution)
        const toolCalls = getToolCalls(response);
        await this.handleToolCalls(runtime, response, toolCalls);
      }

      await this.runHook("afterAgent", runtime);
    } catch (err) {
      console.error(`[agent] Error in conversation ${conversationId}:`, err);
      if (runtime) {
        try {
          await this.persistAndEmit(runtime, "error", { content: String(err) });
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
    const store = new EventStore(conversationId);

    // Get conversation info
    const [conv] = await db.select({ mode: conversations.mode }).from(conversations).where(eq(conversations.id, conversationId));

    // Get or create sandbox
    const sandbox = await this.getOrCreateSandbox(conversationId, store);

    // Build message history from existing events
    const messages = await this.buildMessageHistory(store);

    return {
      sandbox,
      conversationId,
      messages,
      mode: (conv?.mode as "yolo" | "confirm") ?? "yolo",
      state: new Map(),
      store,
      emitSSE: (event) => eventBus.emit(conversationId, event),
      usage: { inputTokens: 0, outputTokens: 0 },
      shouldStop: false,
    };
  }

  private async getOrCreateSandbox(conversationId: string, store: EventStore) {
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
    const streamId = `stream_${Date.now()}`;

    const response = await this.claude.chatStream(runtime.messages, (text) => {
      runtime.emitSSE({
        id: streamId,
        type: "ai_text_delta",
        data: { content: text },
      });
    });

    return response;
  }

  // --- Tool Execution ---

  private async handleToolCalls(runtime: AgentRuntime, response: LLMResponse, toolCalls: ToolCall[]): Promise<void> {
    // Build assistant message with all tool_use blocks
    const textContent = getTextContent(response);
    const assistantContent: Anthropic.ContentBlockParam[] = [];
    if (textContent) {
      assistantContent.push({ type: "text", text: textContent });
    }
    for (const tc of toolCalls) {
      assistantContent.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }
    runtime.messages.push({ role: "assistant", content: assistantContent });

    // Persist all tool_call events
    for (const tc of toolCalls) {
      await this.persistAndEmit(runtime, "tool_call", {
        tool: tc.name,
        args: tc.input as Record<string, string>,
      });
    }

    // Re-check mode (may have changed mid-conversation)
    const [currentConv] = await db.select({ mode: conversations.mode }).from(conversations).where(eq(conversations.id, runtime.conversationId));
    runtime.mode = (currentConv?.mode as "yolo" | "confirm") ?? "yolo";

    // Confirm mode: emit confirm_required and stop
    if (runtime.mode === "confirm") {
      const firstTc = toolCalls[0];
      const confirmData: ConfirmRequiredData = {
        tool: firstTc.name,
        args: firstTc.input as Record<string, string>,
        description: `${firstTc.name}(${JSON.stringify(firstTc.input)})`,
      };
      await this.persistAndEmit(runtime, "confirm_required", confirmData);
      runtime.shouldStop = true;
      return;
    }

    // Yolo mode: execute all tools in parallel
    const results = await Promise.allSettled(toolCalls.map((tc) => this.executeTool(runtime, tc)));

    // Build tool_result messages and persist
    const toolResultContents: Anthropic.ToolResultBlockParam[] = [];

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const result = results[i];
      const output = result.status === "fulfilled" ? result.value : `Error: ${result.reason}`;

      // Persist event
      await this.persistAndEmit(runtime, "tool_result", {
        tool: tc.name,
        output,
      });

      // Handle side effects
      await this.handleToolSideEffects(runtime, tc);

      // Collect for message history
      toolResultContents.push({
        type: "tool_result",
        tool_use_id: tc.id,
        content: output,
      });
    }

    // Add tool results to message history
    runtime.messages.push({ role: "user", content: toolResultContents });
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
      await this.persistAndEmit(runtime, "preview_url", { url, port });
    }
  }

  // --- Confirm Mode ---

  private async handlePendingConfirm(runtime: AgentRuntime): Promise<void> {
    const allEvents = await runtime.store.getEvents();
    if (allEvents.length < 3) return;

    // Find last confirm_response
    let lastConfirmIdx = -1;
    for (let i = allEvents.length - 1; i >= 0; i--) {
      if (allEvents[i].type === "confirm_response") {
        lastConfirmIdx = i;
        break;
      }
    }
    if (lastConfirmIdx === -1) return;

    // Check if already handled
    const hasToolResultAfter = allEvents.slice(lastConfirmIdx + 1).some((e) => e.type === "tool_result");
    if (hasToolResultAfter) return;

    // Find matching tool_call
    let toolCallEvent = null;
    for (let i = lastConfirmIdx - 1; i >= 0; i--) {
      if (allEvents[i].type === "tool_call") {
        toolCallEvent = allEvents[i];
        break;
      }
    }
    if (!toolCallEvent) return;

    const confirmData = toolCallEvent.data as unknown as ConfirmResponseData;
    const toolData = toolCallEvent.data as unknown as ToolCallData;
    const responseData = allEvents[lastConfirmIdx].data as unknown as ConfirmResponseData;

    if (responseData.approved) {
      const tc: ToolCall = {
        id: `tool_${toolCallEvent.seq}`,
        name: toolData.tool,
        input: toolData.args,
      };
      const output = await this.executeTool(runtime, tc);
      await this.persistAndEmit(runtime, "tool_result", { tool: toolData.tool, output });
      await this.handleToolSideEffects(runtime, tc);
    } else {
      await this.persistAndEmit(runtime, "tool_result", {
        tool: toolData.tool,
        output: "User rejected this tool call.",
      });
    }
  }

  // --- Message History ---

  private async buildMessageHistory(store: EventStore): Promise<Anthropic.MessageParam[]> {
    const allEvents = await store.getEvents();
    const messages: Anthropic.MessageParam[] = [];

    for (const event of allEvents) {
      const data = event.data as Record<string, unknown>;

      switch (event.type) {
        case "user_message":
          messages.push({ role: "user", content: data.content as string });
          break;
        case "ai_text": {
          const last = messages[messages.length - 1];
          if (last?.role === "assistant" && typeof last.content === "string") {
            last.content += "\n" + (data.content as string);
          } else {
            messages.push({ role: "assistant", content: data.content as string });
          }
          break;
        }
        case "tool_call": {
          const td = data as unknown as ToolCallData;
          const block = {
            type: "tool_use" as const,
            id: `tool_${event.seq}`,
            name: td.tool,
            input: td.args,
          };
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.role === "assistant" && Array.isArray(lastMsg.content)) {
            lastMsg.content.push(block);
          } else {
            messages.push({ role: "assistant", content: [block] });
          }
          break;
        }
        case "tool_result": {
          const rd = data as unknown as ToolResultData;
          const eventIdx = allEvents.indexOf(event);
          let matchingToolSeq = event.seq - 1;
          for (let j = eventIdx - 1; j >= 0; j--) {
            if (allEvents[j].type === "tool_call") {
              matchingToolSeq = allEvents[j].seq;
              break;
            }
          }
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: `tool_${matchingToolSeq}`,
                content: rd.output,
              },
            ],
          });
          break;
        }
      }
    }

    return messages;
  }

  // --- Helpers ---

  private async persistAndEmit(runtime: AgentRuntime, type: string, data: EventData): Promise<{ id: string; seq: number }> {
    const row = await runtime.store.writeEvent(type, data);
    runtime.emitSSE({
      id: row.id,
      type,
      data: data as Record<string, unknown>,
      seq: row.seq,
    });
    return row;
  }

  private async runHook(
    hook: "beforeAgent" | "beforeModel" | "afterModel" | "afterAgent",
    runtime: AgentRuntime,
    response?: LLMResponse,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (!mw[hook]) continue;
      if (hook === "afterModel" && response) {
        await mw[hook]!(runtime, response as never);
      } else {
        await mw[hook]!(runtime, response as never);
      }
    }
  }
}
