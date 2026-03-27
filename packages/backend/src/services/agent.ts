import Anthropic from "@anthropic-ai/sdk";
import { ClaudeService } from "./claude.js";
import { SandboxService } from "./sandbox.js";
import { EventStore } from "./event-store.js";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { ToolCallData, ToolResultData } from "@web-ai-coding-agent/shared";

export type AgentEventData = ToolCallData | ToolResultData | { content: string };

interface AgentRunOptions {
  conversationId: string;
  userMessage: string;
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

    // Write user message event
    await store.writeEvent("user_message", { content: userMessage });

    // Get or create sandbox
    const sandbox = await this.getOrCreateSandbox(conversationId, store);

    try {
      // Build message history from existing events
      const history = await this.buildMessageHistory(store);

      for (let i = 0; i < maxIterations; i++) {
        const response = await this.claude.chat(history);

        if (response.type === "text") {
          await store.writeEvent("ai_text", { content: response.content });
          break;
        }

        // Handle tool call
        if (response.textContent) {
          await store.writeEvent("ai_text", { content: response.textContent });
        }

        const toolCallData: ToolCallData = {
          tool: response.toolName,
          args: response.toolInput,
        };
        await store.writeEvent("tool_call", toolCallData);

        // Execute tool
        const toolResult = await this.executeTool(sandbox, response.toolName, response.toolInput);
        await store.writeEvent("tool_result", toolResult);

        // If write_file, persist snapshot
        if (response.toolName === "write_file") {
          await store.upsertFileSnapshot(response.toolInput.path, response.toolInput.content);
        }

        // Add to history for next iteration
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

  private async getOrCreateSandbox(conversationId: string, store: EventStore): Promise<SandboxService> {
    // Check if conversation has an active sandbox
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

    // Create new sandbox and restore files
    const sandbox = await SandboxService.create();
    const snapshots = await store.getFileSnapshots();
    if (snapshots.length > 0) {
      await sandbox.restoreFiles(snapshots);
    }

    // Store sandbox ID
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
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: `tool_${event.seq - 1}`,
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
        default:
          return { tool, output: "", error: `Unknown tool: ${tool}` };
      }
    } catch (err) {
      return { tool, output: "", error: String(err) };
    }
  }
}
