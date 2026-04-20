import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import type { AssistantMessage, FileContent, Message } from "../../types/messages";
import type { Tool } from "../../tools/tool";

/**
 * Converts foundation messages to Anthropic API message params.
 * System messages are extracted separately since Anthropic takes them as a top-level param.
 *
 * Async because FileContent blocks may need to be fetched + decoded when the
 * provider doesn't natively support the media type (e.g. text/markdown).
 */
export async function convertToAnthropicMessages(messages: Message[]): Promise<{
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
}> {
  const system: Anthropic.TextBlockParam[] = [];
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      for (const content of message.content) {
        system.push({ type: "text", text: content.text });
      }
    } else if (message.role === "user") {
      const contentBlocks: Anthropic.ContentBlockParam[] = [];
      for (const content of message.content) {
        if (content.type === "text") {
          contentBlocks.push({ type: "text", text: content.text });
        } else if (content.type === "image_url") {
          contentBlocks.push({
            type: "image",
            source: { type: "url", url: content.image_url.url },
          });
        } else if (content.type === "file") {
          contentBlocks.push(...(await encodeFileForAnthropic(content)));
        }
      }
      anthropicMessages.push({ role: "user", content: contentBlocks });
    } else if (message.role === "assistant") {
      const contentBlocks: Anthropic.ContentBlockParam[] = [];
      for (const content of message.content) {
        if (content.type === "thinking") {
          contentBlocks.push({ type: "thinking", thinking: content.thinking, signature: content.signature ?? "" });
        } else if (content.type === "tool_use") {
          contentBlocks.push({
            type: "tool_use",
            id: content.id,
            name: content.name,
            input: content.input,
          });
        } else if (content.type === "text") {
          contentBlocks.push({ type: "text", text: content.text });
        }
      }
      anthropicMessages.push({ role: "assistant", content: contentBlocks });
    } else if (message.role === "tool") {
      const contentBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const content of message.content) {
        if (content.type === "tool_result") {
          contentBlocks.push({
            type: "tool_result",
            tool_use_id: content.tool_use_id,
            content: content.content,
          });
        }
      }
      anthropicMessages.push({ role: "user", content: contentBlocks });
    }
  }

  return { system, messages: anthropicMessages };
}

/**
 * Parses an Anthropic API response into a foundation AssistantMessage.
 */
export function parseAssistantMessage(response: Anthropic.Message): AssistantMessage {
  const result: AssistantMessage = {
    role: "assistant",
    content: [],
  };

  for (const block of response.content) {
    if (block.type === "text") {
      result.content.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      result.content.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
    } else if (block.type === "tool_use") {
      result.content.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  if (response.usage) {
    result.usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  return result;
}

/**
 * Accumulates Anthropic raw stream events into an ever-growing
 * `AssistantMessage` snapshot. Callers feed events one at a time via
 * {@link apply} and read {@link snapshot} for the latest state.
 *
 * Partial `tool_use.input` JSON is stored as a side-channel buffer and
 * best-effort parsed into `input`. Until the JSON is well-formed, `input`
 * stays `{}` so the snapshot is always safe to render.
 */
export class AnthropicStreamAccumulator {
  private message: AssistantMessage = { role: "assistant", content: [] };
  private toolInputBuffers = new Map<number, string>();

  snapshot(): AssistantMessage {
    return {
      role: "assistant",
      content: this.message.content.map((c) => ({ ...c })),
      ...(this.message.usage ? { usage: { ...this.message.usage } } : {}),
    };
  }

  apply(event: Anthropic.RawMessageStreamEvent): void {
    if (event.type === "message_start") {
      const u = event.message.usage;
      if (u) {
        this.message.usage = {
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
        };
      }
      return;
    }
    if (event.type === "message_delta") {
      if (event.usage) {
        this.message.usage = {
          inputTokens: this.message.usage?.inputTokens ?? 0,
          outputTokens: event.usage.output_tokens,
        };
      }
      return;
    }
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "text") {
        this.message.content[event.index] = { type: "text", text: block.text ?? "" };
      } else if (block.type === "thinking") {
        this.message.content[event.index] = {
          type: "thinking",
          thinking: block.thinking ?? "",
          signature: block.signature,
        };
      } else if (block.type === "tool_use") {
        this.toolInputBuffers.set(event.index, "");
        this.message.content[event.index] = {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: {},
        };
      }
      return;
    }
    if (event.type === "content_block_delta") {
      const current = this.message.content[event.index];
      const delta = event.delta;
      if (!current) return;
      if (delta.type === "text_delta" && current.type === "text") {
        current.text += delta.text;
      } else if (delta.type === "thinking_delta" && current.type === "thinking") {
        current.thinking += delta.thinking;
      } else if (delta.type === "signature_delta" && current.type === "thinking") {
        current.signature = (current.signature ?? "") + delta.signature;
      } else if (delta.type === "input_json_delta" && current.type === "tool_use") {
        const buf = (this.toolInputBuffers.get(event.index) ?? "") + delta.partial_json;
        this.toolInputBuffers.set(event.index, buf);
        current.input = parseToolInput(buf);
      }
      return;
    }
    // content_block_stop / message_stop — nothing to accumulate
  }
}

function parseToolInput(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Encode a FileContent block for Anthropic. PDFs go through the native
 * `document` block (URL or base64 source); anything else is read as text and
 * inlined so the model still sees the content — albeit without layout.
 */
async function encodeFileForAnthropic(file: FileContent): Promise<Anthropic.ContentBlockParam[]> {
  if (file.mediaType === "application/pdf") {
    return [
      {
        type: "document",
        source:
          file.data instanceof URL
            ? { type: "url", url: String(file.data) }
            : { type: "base64", media_type: "application/pdf", data: await fileDataToBase64(file.data) },
        ...(file.filename ? { title: file.filename } : {}),
      },
    ];
  }
  const text = await fileDataToText(file.data);
  const header = file.filename ? `[File: ${file.filename}]\n` : "";
  return [{ type: "text", text: header + text }];
}

async function fileDataToText(data: Uint8Array | ArrayBuffer | string | URL): Promise<string> {
  if (data instanceof URL) {
    const response = await fetch(String(data));
    return await response.text();
  }
  if (typeof data === "string") return Buffer.from(data, "base64").toString("utf-8");
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return new TextDecoder().decode(bytes);
}

async function fileDataToBase64(data: Uint8Array | ArrayBuffer | string | URL): Promise<string> {
  if (data instanceof URL) {
    const response = await fetch(String(data));
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }
  if (typeof data === "string") return data;
  const buffer = data instanceof ArrayBuffer ? data : data.buffer;
  return Buffer.from(buffer as ArrayBuffer).toString("base64");
}

/**
 * Converts foundation tools to Anthropic tool definitions.
 */
export function convertToAnthropicTools(tools?: Tool[]): Anthropic.Tool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.parameters) as Anthropic.Tool.InputSchema,
  }));
}
