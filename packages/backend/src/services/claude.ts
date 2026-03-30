import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";
import { toolRegistry } from "../tools/index.js";
import type { LLMResponse } from "../agent/types.js";
import type { Message, MessageRole } from "@code-artisan/shared";

type MessageParam = Anthropic.MessageParam;

function buildSystemPrompt(): string {
  const toolSection = toolRegistry.toPromptSection();
  return `You are an AI coding agent running in a sandboxed Linux environment. You help users write code, execute commands, and build projects.

You have access to these tools:
${toolSection}

Always use tools to interact with the filesystem. When the user asks you to write code, use write_file to create the file, then bash to run it. For web servers, use start_server to launch them and provide the preview URL. Use str_replace to make targeted edits to existing files instead of rewriting the entire file. Be concise in your text responses.`;
}

/**
 * Convert our Message[] to Anthropic MessageParam[].
 * This is provider-specific logic — adapts our generic Part model
 * to Anthropic's message format (tool_use in assistant, tool_result in user).
 */
export function toAnthropicMessages(messages: Message[]): MessageParam[] {
  const result: MessageParam[] = [];

  for (const msg of messages) {
    const role = msg.role as MessageRole;

    if (role === "user") {
      // Skip confirm responses (not sent to LLM)
      if (msg.metadata?.confirmResponse) continue;

      const text = msg.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      if (text) {
        result.push({ role: "user", content: text });
      }
    }

    if (role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      for (const part of msg.parts) {
        if (part.type === "text") {
          content.push({ type: "text", text: part.text });
        }
        if (part.type === "thinking") {
          content.push({
            type: "thinking",
            thinking: part.thinking,
            signature: "",
          } as Anthropic.ContentBlockParam);
        }
        // tool-call parts are now in tool role, not assistant
      }
      if (content.length > 0) {
        result.push({ role: "assistant", content });
      }
    }

    if (role === "tool") {
      // Anthropic format: tool_use in assistant message, tool_result in user message
      for (const part of msg.parts) {
        if (part.type !== "tool-call") continue;

        // Append tool_use block to previous assistant message
        const lastMsg = result[result.length - 1];
        if (lastMsg?.role === "assistant") {
          if (!Array.isArray(lastMsg.content)) {
            lastMsg.content = [{ type: "text", text: lastMsg.content as string }];
          }
          (lastMsg.content as Anthropic.ContentBlockParam[]).push({
            type: "tool_use",
            id: part.toolCallId,
            name: part.toolName,
            input: part.input,
          });
        }

        // Add tool_result as user message (if executed)
        if (part.state === "result" || part.state === "error") {
          result.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: part.toolCallId,
                content: part.output ?? "",
              },
            ],
          });
        }
      }
    }
  }

  return result;
}

export class ClaudeService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async chatStream(
    messages: MessageParam[],
    onText: (fullText: string) => void,
  ): Promise<LLMResponse> {
    const stream = this.client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      system: buildSystemPrompt(),
      tools: toolRegistry.toJsonTools() as Anthropic.Tool[],
      messages,
    });

    let fullText = "";
    stream.on("text", (text) => {
      fullText += text;
      onText(fullText);
    });

    return stream.finalMessage();
  }
}
