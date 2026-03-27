import Anthropic from "@anthropic-ai/sdk";
import { ClaudeService, type ClaudeResponse } from "./claude.js";
import { SandboxService } from "./sandbox.js";
import type { ToolCallData, ToolResultData } from "@web-ai-coding-agent/shared";

export type AgentEventData = ToolCallData | ToolResultData | { content: string };

interface AgentOptions {
  onEvent: (type: string, data: AgentEventData) => void;
  maxIterations?: number;
}

export class AgentService {
  private claude: ClaudeService;
  private options: Required<AgentOptions>;

  constructor(options: AgentOptions) {
    this.claude = new ClaudeService();
    this.options = {
      maxIterations: 10,
      ...options,
    };
  }

  async run(userMessage: string): Promise<{ totalTokens: number }> {
    const sandbox = await SandboxService.create();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

      for (let i = 0; i < this.options.maxIterations; i++) {
        const response = await this.claude.chat(messages);
        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;

        if (response.type === "text") {
          this.options.onEvent("ai_text", { content: response.content });
          break;
        }

        // Handle tool call
        if (response.textContent) {
          this.options.onEvent("ai_text", { content: response.textContent });
        }

        this.options.onEvent("tool_call", {
          tool: response.toolName,
          args: response.toolInput,
        } satisfies ToolCallData);

        // Execute the tool
        const toolResult = await this.executeTool(sandbox, response.toolName, response.toolInput);

        this.options.onEvent("tool_result", toolResult);

        // Add assistant message + tool result to conversation
        messages.push({
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

        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: response.toolCallId,
              content: toolResult.error ? `Error: ${toolResult.error}\nOutput: ${toolResult.output}` : toolResult.output,
            },
          ],
        });
      }
    } finally {
      await sandbox.close();
    }

    return { totalTokens: totalInputTokens + totalOutputTokens };
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
