import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env.js";
import type { LLMProvider, LLMResponse, StreamCallbacks, ToolCall, ToolDefinition } from "../types.js";
import type { Message, MessageRole } from "@code-artisan/shared";

interface ClaudeProviderOptions {
  apiKey?: string;
  model?: string;
  lightModel?: string;
  maxTokens?: number;
  thinking?: boolean;
  thinkingBudget?: number;
}

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private lightModel: string;
  private maxTokens: number;
  private thinking: boolean;
  private thinkingBudget: number;

  constructor(options?: ClaudeProviderOptions) {
    this.client = new Anthropic({ apiKey: options?.apiKey ?? env.ANTHROPIC_API_KEY });
    this.model = options?.model ?? "claude-sonnet-4-20250514";
    this.lightModel = options?.lightModel ?? "claude-haiku-4-5-20251001";
    this.maxTokens = options?.maxTokens ?? 16384;
    this.thinking = options?.thinking ?? true;
    this.thinkingBudget = options?.thinkingBudget ?? 10000;
  }

  async chat(messages: Message[], tools: ToolDefinition[], systemPrompt: string, callbacks: StreamCallbacks): Promise<LLMResponse> {
    const anthropicMessages = toAnthropicMessages(messages);
    const anthropicTools = toAnthropicTools(tools);

    const params: Anthropic.Messages.MessageStreamParams = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      tools: anthropicTools,
      messages: anthropicMessages,
    };

    if (this.thinking) {
      params.thinking = {
        type: "enabled",
        budget_tokens: this.thinkingBudget,
      };
    }

    const stream = this.client.messages.stream(params);

    let fullText = "";
    stream.on("text", (text) => {
      fullText += text;
      callbacks.onTextDelta?.(fullText);
    });

    const response = await stream.finalMessage();
    return parseResponse(response);
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.lightModel,
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
}

// ============================================================
// Internal: Anthropic-specific conversions
// ============================================================

function parseResponse(response: Anthropic.Message): LLMResponse {
  const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

  const textContent = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const thinkingBlocks = response.content.filter((b) => b.type === "thinking");
  const thinking =
    thinkingBlocks.length > 0 ? thinkingBlocks.map((b) => (b as { type: "thinking"; thinking: string }).thinking).join("\n") : undefined;

  const toolCalls: ToolCall[] = toolBlocks.map((b) => ({
    id: b.id,
    name: b.name,
    input: b.input as Record<string, unknown>,
  }));

  return {
    textContent,
    thinking,
    toolCalls,
    stopReason: response.stop_reason ?? "end_turn",
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    model: response.model,
    messageId: response.id,
  };
}

function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    const role = msg.role as MessageRole;

    if (role === "user") {
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
      }
      if (content.length > 0) {
        result.push({ role: "assistant", content });
      }
    }

    if (role === "tool") {
      for (const part of msg.parts) {
        if (part.type !== "tool-call") continue;

        // Append tool_use to previous assistant message
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

        // Add tool_result as user message
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

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
}
