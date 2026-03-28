import Anthropic from "@anthropic-ai/sdk";
import { ClaudeService } from "./claude.js";
import { SandboxService } from "./sandbox.js";
import { EventStore } from "./event-store.js";
import { QuotaService } from "./quota.js";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { ToolCallData, ToolResultData, ConfirmRequiredData, ConfirmResponseData } from "@web-ai-coding-agent/shared";

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

    // Write user message event (only if this is a new message, not a confirm continuation)
    if (userMessage) {
      await store.writeEvent("user_message", { content: userMessage });
    }

    // Get or create sandbox
    const sandbox = await this.getOrCreateSandbox(conversationId, store);

    try {
      // If resuming after confirm, handle the pending tool call first
      const pendingHandled = await this.handlePendingConfirm(store, sandbox);

      // Build message history from all events (including any just-written tool_result)
      const history = await this.buildMessageHistory(store);

      // If we just handled a rejected confirm, Claude needs to respond to the rejection
      // If we just handled an approved confirm, Claude continues with the tool result
      // If no pending confirm, normal flow
      // In all cases, continue the loop unless the pending was a rejection and Claude should respond

      for (let i = 0; i < maxIterations; i++) {
        // Skip first Claude call if we already handled a pending tool (history already has the result)
        if (i === 0 && pendingHandled) {
          // History already includes the tool_result from pending confirm
          // Continue to let Claude process it
        }

        const hasBalance = await quota.checkBalance();
        if (!hasBalance) {
          await store.writeEvent("error", { content: "Token quota exceeded." });
          break;
        }

        const response = await this.claude.chat(history);

        if (response.type === "text") {
          await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);
          await store.writeEvent("ai_text", { content: response.content });
          break;
        }

        await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);

        if (response.textContent) {
          await store.writeEvent("ai_text", { content: response.textContent });
        }

        const toolCallData: ToolCallData = {
          tool: response.toolName,
          args: response.toolInput,
        };
        await store.writeEvent("tool_call", toolCallData);

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
          await store.writeEvent("confirm_required", confirmData);
          return; // Stop — frontend will call POST /confirm, which re-invokes run()
        }

        // YOLO mode: execute immediately
        const toolResult = await this.executeTool(sandbox, response.toolName, response.toolInput);
        await store.writeEvent("tool_result", toolResult);

        if (response.toolName === "write_file") {
          await store.upsertFileSnapshot(response.toolInput.path, response.toolInput.content);
        }

        // Write preview_url event when a server is started
        if (response.toolName === "start_server") {
          const port = Number(response.toolInput.port) || 3000;
          const url = sandbox.getHostUrl(port);
          await store.writeEvent("preview_url", { url, port });
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
      await store.writeEvent("error", { content: String(err) });
    }
  }

  /**
   * Check if there's a pending tool_call that was confirmed/rejected.
   * Pattern: tool_call → confirm_required → confirm_response (no tool_result yet)
   * Returns true if a pending confirm was handled.
   */
  private async handlePendingConfirm(store: EventStore, sandbox: SandboxService): Promise<boolean> {
    const allEvents = await store.getEvents();
    if (allEvents.length < 3) return false;

    // Find the last confirm_response
    let lastConfirmIdx = -1;
    for (let i = allEvents.length - 1; i >= 0; i--) {
      if (allEvents[i].type === "confirm_response") {
        lastConfirmIdx = i;
        break;
      }
    }
    if (lastConfirmIdx === -1) return false;

    // Check there's no tool_result after this confirm_response
    const hasToolResultAfter = allEvents.slice(lastConfirmIdx + 1).some((e) => e.type === "tool_result");
    if (hasToolResultAfter) return false;

    // Find the matching tool_call (before confirm_required before confirm_response)
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
      // Execute the tool
      const toolResult = await this.executeTool(sandbox, toolData.tool, toolData.args);
      await store.writeEvent("tool_result", toolResult);

      if (toolData.tool === "write_file") {
        await store.upsertFileSnapshot(toolData.args.path, toolData.args.content);
      }
      if (toolData.tool === "start_server") {
        const port = Number(toolData.args.port) || 3000;
        const url = sandbox.getHostUrl(port);
        await store.writeEvent("preview_url", { url, port });
      }
    } else {
      // Write rejection result
      const rejectResult: ToolResultData = {
        tool: toolData.tool,
        output: "User rejected this tool call.",
        error: "rejected",
      };
      await store.writeEvent("tool_result", rejectResult);
    }

    return true;
  }

  private async getOrCreateSandbox(conversationId: string, store: EventStore): Promise<SandboxService> {
    const [conv] = await db
      .select({ sandboxId: conversations.sandboxId })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (conv?.sandboxId) {
      try {
        return await SandboxService.reconnect(conv.sandboxId);
      } catch {
        // Sandbox expired, create new one
      }
    }

    const sandbox = await SandboxService.create();
    const snapshots = await store.getFileSnapshots();
    if (snapshots.length > 0) {
      await sandbox.restoreFiles(snapshots);
    }

    await db
      .update(conversations)
      .set({ sandboxId: sandbox.id })
      .where(eq(conversations.id, conversationId));

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
          // Find the matching tool_call by searching backwards (confirm events may be in between)
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
        // confirm_required and confirm_response are UI-only events, not part of Claude history
      }
    }

    return messages;
  }

  private async executeTool(sandbox: SandboxService, tool: string, args: Record<string, string>): Promise<ToolResultData> {
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
          const result = await sandbox.executeCommand(args.command);
          return { tool, output: result.output, error: result.error };
        }
        case "list_files": {
          const files = await sandbox.listFiles(args.path);
          return { tool, output: files.join("\n") };
        }
        case "start_server": {
          await sandbox.startBackgroundCommand(args.command);
          // Wait briefly for the server to start
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
