import Anthropic from "@anthropic-ai/sdk";
import { ClaudeService } from "./claude.js";
import { EventStore } from "./event-store.js";
import { QuotaService } from "./quota.js";
import { eventBus } from "./event-bus.js";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getSandboxProvider } from "../sandbox/index.js";
import type { Sandbox } from "../sandbox/index.js";
import type { ToolCallData, ToolResultData, ConfirmRequiredData, ConfirmResponseData } from "@code-artisan/shared";

export type AgentEventData = ToolCallData | ToolResultData | ConfirmRequiredData | ConfirmResponseData | { content: string } | { url: string; port: number };

interface AgentRunOptions {
  conversationId: string;
  userMessage?: string;
  maxIterations?: number;
}

export class AgentService {
  private claude: ClaudeService;

  constructor() {
    this.claude = new ClaudeService();
  }

  /** Write event to DB and emit to SSE */
  private async emitAndPersist(
    store: EventStore,
    conversationId: string,
    type: string,
    data: AgentEventData,
  ): Promise<{ id: string; seq: number }> {
    const row = await store.writeEvent(type, data);
    eventBus.emit(conversationId, {
      id: row.id,
      type,
      data: data as Record<string, unknown>,
      seq: row.seq,
    });
    return row;
  }

  async run(options: AgentRunOptions): Promise<void> {
    const { conversationId, userMessage, maxIterations = 10 } = options;
    const store = new EventStore(conversationId);

    // Get conversation info
    const [conv] = await db
      .select({ userId: conversations.userId, mode: conversations.mode })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    const userId = conv?.userId ?? "00000000-0000-0000-0000-000000000000";
    const quota = new QuotaService(userId);

    // Write user message event
    if (userMessage) {
      await this.emitAndPersist(store, conversationId, "user_message", { content: userMessage });
    }

    // Get or create sandbox
    const sandbox = await this.getOrCreateSandbox(conversationId, store);

    try {
      // If resuming after confirm, handle the pending tool call first
      const pendingHandled = await this.handlePendingConfirm(store, sandbox, conversationId);

      // Build message history from all events
      const history = await this.buildMessageHistory(store);

      for (let i = 0; i < maxIterations; i++) {
        if (i === 0 && pendingHandled) {
          // History already includes the tool_result from pending confirm
        }

        const hasBalance = await quota.checkBalance();
        if (!hasBalance) {
          await this.emitAndPersist(store, conversationId, "error", { content: "Token quota exceeded." });
          break;
        }

        // Stream text via SSE only (no DB writes per chunk)
        const streamId = `stream_${Date.now()}`;

        const response = await this.claude.chatStream(history, (text) => {
          eventBus.emit(conversationId, {
            id: streamId,
            type: "ai_text_delta",
            data: { content: text },
          });
        });

        if (response.type === "text") {
          // Write final text to DB and emit
          await this.emitAndPersist(store, conversationId, "ai_text", { content: response.content });
          await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);
          break;
        }

        await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);

        // Tool use response — persist any text content
        if (response.textContent) {
          await this.emitAndPersist(store, conversationId, "ai_text", { content: response.textContent });
        }

        const toolCallData: ToolCallData = {
          tool: response.toolName,
          args: response.toolInput,
        };
        await this.emitAndPersist(store, conversationId, "tool_call", toolCallData);

        // Check current mode
        const [currentConv] = await db
          .select({ mode: conversations.mode })
          .from(conversations)
          .where(eq(conversations.id, conversationId));

        const mode = currentConv?.mode ?? "yolo";

        // In confirm mode: write confirm_required and STOP
        if (mode === "confirm") {
          const description = `${response.toolName}(${JSON.stringify(response.toolInput)})`;
          const confirmData: ConfirmRequiredData = {
            tool: response.toolName,
            args: response.toolInput,
            description,
          };
          await this.emitAndPersist(store, conversationId, "confirm_required", confirmData);
          return; // Stop — frontend will call POST /confirm, which re-invokes run()
        }

        // YOLO mode: execute immediately
        const toolResult = await this.executeTool(sandbox, response.toolName, response.toolInput);
        await this.emitAndPersist(store, conversationId, "tool_result", toolResult);

        if (response.toolName === "write_file") {
          await store.upsertFileSnapshot(response.toolInput.path, response.toolInput.content);
        }

        if (response.toolName === "start_server") {
          const port = Number(response.toolInput.port) || 3000;
          const url = sandbox.getHostUrl(port);
          await this.emitAndPersist(store, conversationId, "preview_url", { url, port });
        }

        history.push({
          role: "assistant",
          content: [
            ...(response.textContent ? [{ type: "text" as const, text: response.textContent }] : []),
            {
              type: "tool_use" as const,
              id: response.toolCallId,
              name: response.toolName,
              input: response.toolInput,
            },
          ],
        });

        history.push({
          role: "user",
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: response.toolCallId,
              content: toolResult.error
                ? `Error: ${toolResult.error}\nOutput: ${toolResult.output}`
                : toolResult.output,
            },
          ],
        });
      }
    } catch (err) {
      await this.emitAndPersist(store, conversationId, "error", { content: String(err) });
    }

    eventBus.emitDone(conversationId);
  }

  private async handlePendingConfirm(
    store: EventStore,
    sandbox: Sandbox,
    conversationId: string,
  ): Promise<boolean> {
    const allEvents = await store.getEvents();
    if (allEvents.length < 3) return false;

    let lastConfirmIdx = -1;
    for (let i = allEvents.length - 1; i >= 0; i--) {
      if (allEvents[i].type === "confirm_response") {
        lastConfirmIdx = i;
        break;
      }
    }
    if (lastConfirmIdx === -1) return false;

    const hasToolResultAfter = allEvents.slice(lastConfirmIdx + 1).some((e) => e.type === "tool_result");
    if (hasToolResultAfter) return false;

    let toolCallEvent = null;
    for (let i = lastConfirmIdx - 1; i >= 0; i--) {
      if (allEvents[i].type === "tool_call") {
        toolCallEvent = allEvents[i];
        break;
      }
    }
    if (!toolCallEvent) return false;

    const confirmData = allEvents[lastConfirmIdx].data as unknown as ConfirmResponseData;
    const toolData = toolCallEvent.data as unknown as ToolCallData;

    if (confirmData.approved) {
      const toolResult = await this.executeTool(sandbox, toolData.tool, toolData.args);
      await this.emitAndPersist(store, conversationId, "tool_result", toolResult);

      if (toolData.tool === "write_file") {
        await store.upsertFileSnapshot(toolData.args.path, toolData.args.content);
      }
      if (toolData.tool === "start_server") {
        const port = Number(toolData.args.port) || 3000;
        const url = sandbox.getHostUrl(port);
        await this.emitAndPersist(store, conversationId, "preview_url", { url, port });
      }
    } else {
      const rejectResult: ToolResultData = {
        tool: toolData.tool,
        output: "User rejected this tool call.",
        error: "rejected",
      };
      await this.emitAndPersist(store, conversationId, "tool_result", rejectResult);
    }

    return true;
  }

  private async getOrCreateSandbox(conversationId: string, store: EventStore): Promise<Sandbox> {
    const provider = getSandboxProvider();

    const [conv] = await db
      .select({ sandboxId: conversations.sandboxId })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    const sandbox = await provider.acquire(conv?.sandboxId ?? undefined);

    // If we got a new sandbox (different ID), restore file snapshots
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
          const toolData = data as unknown as ToolCallData;
          const toolUseBlock = {
            type: "tool_use" as const,
            id: `tool_${event.seq}`,
            name: toolData.tool,
            input: toolData.args,
          };

          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.role === "assistant" && Array.isArray(lastMsg.content)) {
            lastMsg.content.push(toolUseBlock);
          } else {
            messages.push({ role: "assistant", content: [toolUseBlock] });
          }
          break;
        }
        case "tool_result": {
          const resultData = data as unknown as ToolResultData;
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
                content: resultData.error
                  ? `Error: ${resultData.error}\nOutput: ${resultData.output}`
                  : resultData.output,
              },
            ],
          });
          break;
        }
      }
    }

    return messages;
  }

  private async executeTool(sandbox: Sandbox, tool: string, args: Record<string, string>): Promise<ToolResultData> {
    try {
      switch (tool) {
        case "read_file": {
          const content = await sandbox.readFile(args.path);
          return { tool, output: content };
        }
        case "write_file": {
          await sandbox.writeFile(args.path, args.content);
          return { tool, output: `File written to ${args.path}` };
        }
        case "execute_command": {
          const output = await sandbox.executeCommand(args.command);
          return { tool, output };
        }
        case "list_files": {
          const entries = await sandbox.listDir(args.path);
          return { tool, output: entries.join("\n") };
        }
        case "start_server": {
          await sandbox.executeCommand(args.command, { background: true });
          await new Promise((r) => setTimeout(r, 2000));
          const port = Number(args.port) || 3000;
          const url = sandbox.getHostUrl(port);
          return { tool, output: `Server started. Preview URL: ${url}` };
        }
        default:
          return { tool, output: "", error: `Unknown tool: ${tool}` };
      }
    } catch (err) {
      return { tool, output: "", error: String(err) };
    }
  }
}
