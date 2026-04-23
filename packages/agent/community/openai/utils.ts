import type OpenAI from "openai";
import * as z from "zod";
import type { AssistantMessage, FileContent, Message } from "../../types/messages";
import type { Tool } from "../../tools/tool";

/**
 * Converts foundation messages to OpenAI chat-completion message params.
 *
 * Shape differences vs Anthropic:
 *   - A single assistant block-list flattens into one message with `content`
 *     (accumulated text), `reasoning_content` (accumulated thinking), and
 *     `tool_calls[]`. Multiple thinking/text blocks are merged.
 *   - Each `ToolResultContent` becomes its own `{ role: "tool", ... }`
 *     message, not a single user message with multiple tool_result blocks.
 */
export async function convertToOpenAIMessages(
  messages: Message[],
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      const text = message.content.map((c) => c.text).join("\n");
      result.push({ role: "system", content: text });
    } else if (message.role === "user") {
      const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
      for (const content of message.content) {
        if (content.type === "text") {
          parts.push({ type: "text", text: content.text });
        } else if (content.type === "image_url") {
          parts.push({ type: "image_url", image_url: { url: content.image_url.url } });
        } else if (content.type === "file") {
          parts.push(...(await encodeFileForOpenAI(content)));
        }
      }
      result.push({ role: "user", content: parts });
    } else if (message.role === "assistant") {
      const textBuf: string[] = [];
      const reasoningBuf: string[] = [];
      const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall[] = [];
      for (const content of message.content) {
        if (content.type === "text") {
          textBuf.push(content.text);
        } else if (content.type === "thinking") {
          reasoningBuf.push(content.thinking);
        } else if (content.type === "tool_use") {
          toolCalls.push({
            id: content.id,
            type: "function",
            function: { name: content.name, arguments: JSON.stringify(content.input ?? {}) },
          });
        }
      }
      const assistant: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textBuf.length > 0 ? textBuf.join("") : null,
      };
      if (toolCalls.length > 0) assistant.tool_calls = toolCalls;
      if (reasoningBuf.length > 0) {
        // Non-standard field picked up by reasoning-capable OpenAI-compatible
        // models (Kimi K2, DeepSeek R1, etc.). Typed loosely on purpose — the
        // official SDK doesn't ship it yet.
        (assistant as unknown as Record<string, unknown>).reasoning_content =
          reasoningBuf.join("");
      }
      result.push(assistant);
    } else if (message.role === "tool") {
      for (const content of message.content) {
        if (content.type === "tool_result") {
          result.push({
            role: "tool",
            tool_call_id: content.tool_use_id,
            content: content.content,
          });
        }
      }
    }
  }

  return result;
}

/**
 * Parses an OpenAI chat-completion response into a foundation AssistantMessage.
 *
 * Defensive on the choice/message shape: proxies routing to reasoning-capable
 * models sometimes return malformed payloads; treat those as an empty
 * assistant message so the caller can log and move on.
 */
export function parseAssistantMessage(
  response: OpenAI.Chat.Completions.ChatCompletion,
): AssistantMessage {
  const result: AssistantMessage = { role: "assistant", content: [] };
  const message = response?.choices?.[0]?.message;
  if (!message) return result;

  const reasoning = (message as unknown as Record<string, unknown>).reasoning_content;
  if (typeof reasoning === "string" && reasoning.length > 0) {
    result.content.push({ type: "thinking", thinking: reasoning });
  }
  if (typeof message.content === "string" && message.content.length > 0) {
    result.content.push({ type: "text", text: message.content });
  }
  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      result.content.push({
        type: "tool_use",
        id: call.id,
        name: call.function.name,
        input: parseToolInput(call.function.arguments),
      });
    }
  }

  if (response.usage) {
    result.usage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    };
  }

  return result;
}

/**
 * Accumulates OpenAI stream chunks into an ever-growing AssistantMessage
 * snapshot. Usage is captured from the final chunk when `stream_options:
 * { include_usage: true }` is set on the request.
 *
 * Tool calls stream as deltas keyed by `index` — the first delta for a given
 * index carries `id` + `function.name`; subsequent deltas extend
 * `function.arguments` with partial JSON. Partial args parse to `{}` until
 * well-formed, so snapshots stay renderable throughout.
 */
export class OpenAIStreamAccumulator {
  private textParts: Map<number, string> = new Map();
  private reasoningParts: Map<number, string> = new Map();
  /** Preserves first-seen ordering of blocks when building snapshots. */
  private blockOrder: Array<{ kind: "text" | "thinking" | "tool_use"; key: number | string }> = [];
  private toolCalls = new Map<
    number,
    { id: string; name: string; argsBuffer: string }
  >();
  private usage: { inputTokens: number; outputTokens: number } | undefined;

  snapshot(): AssistantMessage {
    const content: AssistantMessage["content"] = [];
    for (const block of this.blockOrder) {
      if (block.kind === "thinking") {
        const thinking = this.reasoningParts.get(block.key as number) ?? "";
        if (thinking.length > 0) content.push({ type: "thinking", thinking });
      } else if (block.kind === "text") {
        const text = this.textParts.get(block.key as number) ?? "";
        if (text.length > 0) content.push({ type: "text", text });
      } else if (block.kind === "tool_use") {
        const call = this.toolCalls.get(block.key as number);
        if (!call) continue;
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: parseToolInput(call.argsBuffer),
        });
      }
    }
    return {
      role: "assistant",
      content,
      ...(this.usage ? { usage: { ...this.usage } } : {}),
    };
  }

  apply(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): void {
    if (chunk.usage) {
      this.usage = {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
      };
    }

    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta &
      { reasoning_content?: string };

    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      const key = choice.index ?? 0;
      if (!this.reasoningParts.has(key)) {
        this.reasoningParts.set(key, "");
        this.blockOrder.push({ kind: "thinking", key });
      }
      this.reasoningParts.set(key, (this.reasoningParts.get(key) ?? "") + delta.reasoning_content);
    }

    if (typeof delta.content === "string" && delta.content.length > 0) {
      const key = choice.index ?? 0;
      if (!this.textParts.has(key)) {
        this.textParts.set(key, "");
        this.blockOrder.push({ kind: "text", key });
      }
      this.textParts.set(key, (this.textParts.get(key) ?? "") + delta.content);
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        let call = this.toolCalls.get(idx);
        if (!call) {
          call = { id: "", name: "", argsBuffer: "" };
          this.toolCalls.set(idx, call);
          this.blockOrder.push({ kind: "tool_use", key: idx });
        }
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name = tc.function.name;
        if (tc.function?.arguments) call.argsBuffer += tc.function.arguments;
      }
    }
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
 * Encode a FileContent block for OpenAI. OpenAI chat-completions doesn't
 * uniformly accept PDFs across models; inline everything as text so the
 * model still sees the content (without native layout).
 */
async function encodeFileForOpenAI(
  file: FileContent,
): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
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

/**
 * Converts foundation tools to OpenAI function-tool definitions.
 */
export function convertToOpenAITools(
  tools?: Tool[],
): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.parameters) as Record<string, unknown>,
    },
  }));
}
