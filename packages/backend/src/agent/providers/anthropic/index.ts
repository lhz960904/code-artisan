import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../../env.js";
import type { LLMProvider, LLMResponse, ThinkingBlock, ToolCall, ToolDefinition } from "../../types.js";
import type { Message, MessageRole, StreamData } from "@code-artisan/shared";

interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  lightModel?: string;
  maxTokens?: number;
  thinking?: boolean;
  thinkingBudget?: number;
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private lightModel: string;
  private maxTokens: number;
  private thinking: boolean;
  private thinkingBudget: number;

  constructor(options?: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options?.apiKey ?? env.ANTHROPIC_API_KEY });
    this.model = options?.model ?? "claude-sonnet-4-20250514";
    this.lightModel = options?.lightModel ?? "claude-haiku-4-5-20251001";
    this.maxTokens = options?.maxTokens ?? 16384;
    this.thinking = options?.thinking ?? true;
    this.thinkingBudget = options?.thinkingBudget ?? 10000;
  }

  async chat(messages: Message[], tools: ToolDefinition[], systemPrompt: string, emitStream: (data: StreamData) => void, messageId: string): Promise<LLMResponse> {
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
      params.thinking = { type: "enabled", budget_tokens: this.thinkingBudget };
    }

    const stream = this.client.messages.stream(params);

    // blockTypes/blockIds track per-index metadata for content_block_stop
    const blockTypes = new Map<number, string>();
    const blockIds   = new Map<number, string>(); // index → blockId (text/thinking) or toolCallId (tool_use)

    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start") {
        const { index, content_block } = event;
        blockTypes.set(index, content_block.type);

        if (content_block.type === "text") {
          const blockId = `b${index}`;
          blockIds.set(index, blockId);
          emitStream({ type: "text-start", messageId, blockId });
        } else if (content_block.type === "thinking") {
          const blockId = `b${index}`;
          blockIds.set(index, blockId);
          emitStream({ type: "reasoning-start", messageId, blockId });
        } else if (content_block.type === "tool_use") {
          blockIds.set(index, content_block.id);
          emitStream({ type: "tool-input-start", messageId, toolCallId: content_block.id, toolName: content_block.name });
        }
      }

      if (event.type === "content_block_delta") {
        const { index, delta } = event;
        const id = blockIds.get(index);
        if (!id) return;

        if (delta.type === "text_delta") {
          emitStream({ type: "text-delta", messageId, blockId: id, delta: delta.text });
        } else if (delta.type === "thinking_delta") {
          emitStream({ type: "reasoning-delta", messageId, blockId: id, delta: delta.thinking });
        } else if (delta.type === "input_json_delta") {
          emitStream({ type: "tool-input-delta", messageId, toolCallId: id, delta: delta.partial_json });
        }
      }

      if (event.type === "content_block_stop") {
        const { index } = event;
        const id = blockIds.get(index);
        const blockType = blockTypes.get(index);
        if (!id || !blockType) return;

        if (blockType === "text") {
          emitStream({ type: "text-end", messageId, blockId: id });
        } else if (blockType === "thinking") {
          emitStream({ type: "reasoning-end", messageId, blockId: id });
        }
        // tool_use: tool-input-end emitted after finalMessage (needs complete input)
      }
    });

    const response = await stream.finalMessage();

    // Emit tool-input-end with complete parsed inputs
    for (const block of response.content) {
      if (block.type === "tool_use") {
        emitStream({ type: "tool-input-end", messageId, toolCallId: block.id, input: block.input });
      }
    }

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

  const thinkingBlocks: ThinkingBlock[] = response.content
    .filter((b) => b.type === "thinking")
    .map((b) => {
      const tb = b as { type: "thinking"; thinking: string; signature: string };
      return { thinking: tb.thinking, signature: tb.signature };
    });

  const toolCalls: ToolCall[] = toolBlocks.map((b) => ({
    id: b.id,
    name: b.name,
    input: b.input as Record<string, unknown>,
  }));

  return {
    textContent,
    thinkingBlocks,
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

/**
 * Convert our Message[] to Anthropic MessageParam[].
 * Uses look-ahead to batch consecutive tool messages with their preceding assistant message.
 * Anthropic requires: assistant(tool_use) → user(tool_result), strictly paired.
 */
export function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
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
        if (part.type === "thinking" && part.signature) {
          content.push({
            type: "thinking",
            thinking: part.thinking,
            signature: part.signature,
          } as Anthropic.ContentBlockParam);
        }
      }

      // Look ahead: collect ALL consecutive tool messages
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      let j = i + 1;
      while (j < messages.length && messages[j].role === "tool") {
        for (const part of messages[j].parts) {
          if (part.type !== "tool-call") continue;
          // Append tool_use to assistant content
          content.push({
            type: "tool_use",
            id: part.toolCallId,
            name: part.toolName,
            input: part.input,
          });
          // Collect tool_result
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

      // All tool_results in a single user message
      if (toolResultBlocks.length > 0) {
        result.push({ role: "user", content: toolResultBlocks });
      }

      // Skip processed tool messages
      i = j - 1;
    }

    // Standalone tool messages (no preceding assistant) — shouldn't happen normally
    // but handle gracefully by skipping (they'll be orphaned)
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
