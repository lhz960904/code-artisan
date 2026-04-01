import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../../env.js";
import type { LLMProvider, ToolDefinition, MessageStreamParams, GenerateTextParams } from "../../types.js";
import type { Message, MessageStreamEvent, FinishReason } from "@code-artisan/shared";

interface AnthropicProviderOptions {
  apiKey?: string;
  client?: unknown;
  maxTokens?: number;
  thinking?: boolean;
  thinkingBudget?: number;
}

interface BlockState {
  type: string;
  id: string;
  toolName: string;
  signature: string;
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private maxTokens: number;
  private thinking: boolean;
  private thinkingBudget: number;

  constructor(options?: AnthropicProviderOptions) {
    this.client = (options?.client as Anthropic) ?? new Anthropic({ apiKey: options?.apiKey ?? env.ANTHROPIC_API_KEY });
    this.maxTokens = options?.maxTokens ?? 16384;
    this.thinking = options?.thinking ?? true;
    this.thinkingBudget = options?.thinkingBudget ?? 10000;
  }

  async *stream(params: MessageStreamParams): AsyncGenerator<MessageStreamEvent> {
    const anthropicParams: Anthropic.Messages.MessageStreamParams = {
      model: params.model,
      max_tokens: this.maxTokens,
      system: params.system,
      tools: toAnthropicTools(params.tools),
      messages: toAnthropicMessages(params.messages),
    };
    if (this.thinking) {
      anthropicParams.thinking = { type: "enabled", budget_tokens: this.thinkingBudget };
    }

    const stream = this.client.messages.stream(anthropicParams);
    let inputTokens = 0;

    // Track each content block by index
    const blocks = new Map<number, {
      type: "text" | "thinking" | "tool_use";
      text: string;
      toolCallId: string;
      toolName: string;
      signature: string;
    }>();

    try {
      for await (const event of stream) {
        if (event.type === "message_start") {
          inputTokens = event.message?.usage?.input_tokens ?? 0;
          yield { type: "step-start" };
        }

        if (event.type === "content_block_start") {
          const { index, content_block: cb } = event;
          const id = index.toString();
          if (cb.type === "text") {
            blocks.set(index, { type: "text", text: "", toolCallId: "", toolName: "", signature: "" });
            yield { type: "text-start", id };
          } else if (cb.type === "thinking") {
            blocks.set(index, { type: "thinking", text: "", toolCallId: "", toolName: "", signature: "" });
            yield { type: "thinking-start", id };
          } else if (cb.type === "tool_use") {
            blocks.set(index, { type: "tool_use", text: "", toolCallId: cb.id, toolName: cb.name, signature: "" });
            yield { type: "tool-input-start", toolCallId: cb.id, toolName: cb.name };
          }
        }

        if (event.type === "content_block_delta") {
          const { index, delta } = event;
          const id = index.toString();
          const block = blocks.get(index);
          if (!block) continue;

          if (delta.type === "text_delta") {
            block.text += delta.text;
            yield { type: "text-delta", id, delta: delta.text };
          } else if (delta.type === "thinking_delta") {
            block.text += delta.thinking;
            yield { type: "thinking-delta", id, delta: delta.thinking };
          } else if (delta.type === "input_json_delta") {
            block.text += delta.partial_json;
            yield { type: "tool-input-delta", toolCallId: block.toolCallId, toolName: block.toolName, delta: delta.partial_json };
          } else if (delta.type === "signature_delta") {
            block.signature = delta.signature;
          }
        }

        if (event.type === "content_block_stop") {
          const { index } = event;
          const id = index.toString();
          const block = blocks.get(index);
          if (!block) continue;

          if (block.type === "text") {
            yield { type: "text-end", id, text: block.text };
          } else if (block.type === "thinking") {
            yield { type: "thinking-end", id, signature: block.signature, text: block.text };
          } else if (block.type === "tool_use") {
            yield { type: "tool-input-end", toolCallId: block.toolCallId, toolName: block.toolName, text: block.text };
          }

          blocks.delete(index);
        }

        if (event.type === "message_delta") {
          const delta = event.delta 
          yield {
            type: "step-finish",
            finishReason: mapStopReason(delta?.stop_reason),
            usage: { inputTokens, outputTokens: event.usage.output_tokens ?? 0 },
          };
        }
      }
    } catch (err) {
      yield { type: "error", error: err instanceof Error ? err.message : String(err) };
    }

    yield { type: "stream-finish" };
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: 100,
      system: params.system,
      messages: toAnthropicMessages(params.messages),
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

function mapStopReason(stopReason: string | null | undefined): FinishReason {
  switch (stopReason) {
    case "end_turn": return "stop";
    case "stop_sequence": return "stop";
    case "tool_use": return "tool_calls";
    case "max_tokens": return "max_tokens";
    default: return stopReason as FinishReason;
  }
}

/**
 * Convert our Message[] to Anthropic MessageParam[].
 * Uses look-ahead to batch consecutive tool messages with their preceding assistant message.
 * Anthropic requires: assistant(tool_use) → user(tool_result), strictly paired.
 */
export function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "user") {
      if (msg.metadata?.confirmResponse) continue;
      const text = msg.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      if (text) {
        result.push({ role: "user", content: text });
      }
    }

    if (msg.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      for (const part of msg.parts) {
        if (part.type === "text") {
          content.push({ type: "text", text: part.text });
        }
        if (part.type === "thinking" && part.signature) {
          content.push({
            type: "thinking",
            thinking: part.thinking,
            signature: part.signature,
          } as Anthropic.ContentBlockParam);
        }
      }

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === "tool") {
        for (const part of messages[j].parts) {
          if (part.type !== "tool-call") continue;
          content.push({
            type: "tool_use",
            id: part.toolCallId,
            name: part.toolName,
            input: part.input,
          });
          if (part.state === "result" || part.state === "error") {
            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: part.toolCallId,
              content: part.output ?? "",
            });
          }
        }
        j++;
      }

      if (content.length > 0) {
        result.push({ role: "assistant", content });
      }

      if (toolResultBlocks.length > 0) {
        result.push({ role: "user", content: toolResultBlocks });
      }

      i = j - 1;
    }
  }

  return result;
}

function toAnthropicTools(tools?: ToolDefinition[]): Anthropic.Tool[] {
  return tools?.map((t) => ({
    name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    })) ?? [];
}
