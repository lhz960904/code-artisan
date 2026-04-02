import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../../env.js";
import { getFileBuffer, getPublicUrl } from "../../../services/storage.js";
import type { LLMProvider, ToolDefinition, MessageStreamParams, GenerateTextParams } from "../../types.js";
import type { Message, MessageStreamEvent, FinishReason, ImagePart, DocumentPart } from "@code-artisan/shared";

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
      messages: await toAnthropicMessages(params.messages),
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
      messages: await toAnthropicMessages(params.messages),
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
export async function toAnthropicMessages(messages: Message[]): Promise<Anthropic.MessageParam[]> {
  const result: Anthropic.MessageParam[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "user") {
      if (msg.metadata?.confirmResponse) continue;

      const hasAttachments = msg.parts.some((p) => p.type === "image" || p.type === "document");

      if (!hasAttachments) {
        const text = msg.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        if (text) {
          result.push({ role: "user", content: text });
        }
      } else {
        const contentBlocks: Anthropic.ContentBlockParam[] = [];

        for (const part of msg.parts) {
          if (part.type === "image") {
            const block = await resolveImageContent(part);
            contentBlocks.push(block);
          } else if (part.type === "document") {
            const block = await resolveDocumentContent(part);
            contentBlocks.push(block);
          } else if (part.type === "text" && part.text) {
            contentBlocks.push({ type: "text", text: part.text });
          }
        }

        if (contentBlocks.length > 0) {
          result.push({ role: "user", content: contentBlocks });
        }
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
          // Only include completed tool calls (with matching result)
          // Skip state="call" or "partial-call" — no tool_result to pair with
          if (part.state !== "result" && part.state !== "error") continue;
          content.push({
            type: "tool_use",
            id: part.toolCallId,
            name: part.toolName,
            input: part.input,
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: part.toolCallId,
            content: part.output ?? "",
          });
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

// ============================================================
// Attachment resolution helpers
// ============================================================

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "js", "ts", "jsx", "tsx", "py", "rb", "go", "rs",
  "java", "c", "cpp", "h", "hpp", "css", "html", "xml", "yaml", "yml",
  "toml", "ini", "cfg", "sh", "bash", "zsh", "sql", "graphql", "vue",
  "svelte", "astro", "env", "gitignore", "dockerignore", "makefile",
]);

function isTextFile(mimeType: string, fileUrl: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json" || mimeType === "application/xml") return true;
  const ext = fileUrl.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

function extractFileId(url: string): string {
  return url.replace(/^files\//, "");
}

async function resolveImageContent(part: ImagePart): Promise<Anthropic.ImageBlockParam> {
  if (part.source.type === "base64") {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: part.mediaType as Anthropic.Base64ImageSource["media_type"],
        data: part.source.data,
      },
    };
  }
  const fileId = extractFileId(part.source.url);
  const publicUrl = getPublicUrl(fileId);
  return {
    type: "image",
    source: { type: "url", url: publicUrl },
  };
}

async function resolveDocumentContent(part: DocumentPart): Promise<Anthropic.ContentBlockParam> {
  if (part.source.type === "base64") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: part.mediaType as "application/pdf",
        data: part.source.data,
      },
      ...(part.title && { title: part.title }),
    } as Anthropic.ContentBlockParam;
  }

  if (part.source.type === "text") {
    return { type: "text", text: part.title ? `[File: ${part.title}]\n${part.source.text}` : part.source.text };
  }

  // URL source — fetch from storage
  const fileId = extractFileId(part.source.url);

  // PDF → base64 document block
  if (part.mediaType === "application/pdf") {
    const buffer = await getFileBuffer(fileId);
    const base64 = Buffer.from(buffer).toString("base64");
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
      ...(part.title && { title: part.title }),
    } as Anthropic.ContentBlockParam;
  }

  // Text-like files → read as text
  if (isTextFile(part.mediaType, part.source.url)) {
    const buffer = await getFileBuffer(fileId);
    const text = new TextDecoder().decode(buffer);
    return {
      type: "text",
      text: part.title ? `[File: ${part.title}]\n${text}` : text,
    };
  }

  // Unsupported binary
  return {
    type: "text",
    text: `[Unsupported file: ${part.title ?? fileId}]`,
  };
}
