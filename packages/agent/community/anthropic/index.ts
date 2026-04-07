import { Anthropic } from "@anthropic-ai/sdk";
import type { Message, AssistantMessage, StreamEvent, FinishReason } from "../../types/messages";
import type { TextContent, ThinkingContent, ToolUseContent, ToolResultContent } from "../../types/messages/content";
import { BaseProvider, type BaseInvokeParams } from "../../types/provider/base";

type AnthropicMessageParam = Anthropic.Messages.MessageParam;
type AnthropicTool = Anthropic.Messages.Tool;

// ---- Conversion: Custom → Anthropic ----

function toAnthropicMessages(messages: Message[]): {
  system: string | undefined;
  messages: AnthropicMessageParam[];
} {
  let system: string | undefined;
  const out: AnthropicMessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = msg.content.map((c) => c.text).join("");
      continue;
    }

    if (msg.role === "user") {
      const blocks = msg.content.map((part): Anthropic.Messages.ContentBlockParam => {
        if (part.type === "text") {
          return { type: "text", text: part.text };
        }
        // image_url → Anthropic image
        return {
          type: "image",
          source: { type: "url", url: part.image_url.url },
        };
      });
      out.push({ role: "user", content: blocks });
      continue;
    }

    if (msg.role === "assistant") {
      const blocks: Anthropic.Messages.ContentBlockParam[] = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "thinking") {
          // thinking blocks are not sent back to Anthropic
        } else if (part.type === "tool_use") {
          blocks.push({
            type: "tool_use",
            id: part.id,
            name: part.name,
            input: part.input,
          });
        }
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    if (msg.role === "tool") {
      out.push({
        role: "user",
        content: msg.content.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
      });
    }
  }

  return { system, messages: out };
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function toAnthropicTools(tools?: ToolDefinition[]): AnthropicTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
  }));
}

// ---- Conversion: Anthropic → Custom ----

function fromAnthropicResponse(msg: Anthropic.Messages.Message): AssistantMessage {
  const content: AssistantMessage["content"] = [];

  for (const block of msg.content) {
    if (block.type === "thinking") {
      content.push({ type: "thinking", thinking: block.thinking } as ThinkingContent);
    } else if (block.type === "text") {
      content.push({ type: "text", text: block.text } as TextContent);
    } else if (block.type === "tool_use") {
      content.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      } as ToolUseContent);
    }
  }

  return { role: "assistant", content };
}

// ---- Provider ----

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;
  private model: string;

  constructor(model: string, options?: AnthropicProviderOptions) {
    super();
    this.model = model;
    this.client = new Anthropic({
      apiKey: options?.apiKey,
      baseURL: options?.baseURL,
    });
  }

  async invoke(params: BaseInvokeParams): Promise<AssistantMessage> {
    const { messages, max_tokens: rawMaxTokens, tools: rawTools, system: rawSystem, ...extra } = params;
    const { system: extractedSystem, messages: anthropicMessages } = toAnthropicMessages(messages);
    const max_tokens = (rawMaxTokens as number | undefined) ?? 4096;
    const tools = rawTools as ToolDefinition[] | undefined;
    const system = (rawSystem as string | undefined) ?? extractedSystem;

    const response = await this.client.messages.create({
      model: this.model,
      messages: anthropicMessages,
      max_tokens,
      system,
      ...(toAnthropicTools(tools) ? { tools: toAnthropicTools(tools) } : {}),
      stream: false as const,
      ...extra,
    });

    return fromAnthropicResponse(response);
  }

  async *stream(params: BaseInvokeParams): AsyncIterable<StreamEvent> {
    const { messages, max_tokens: rawMaxTokens, tools: rawTools, system: rawSystem, ...extra } = params;
    const { system: extractedSystem, messages: anthropicMessages } = toAnthropicMessages(messages);
    const max_tokens = (rawMaxTokens as number | undefined) ?? 4096;
    const tools = rawTools as ToolDefinition[] | undefined;
    const system = (rawSystem as string | undefined) ?? extractedSystem;

    const response = await this.client.messages.create({
      model: this.model,
      messages: anthropicMessages,
      max_tokens,
      system,
      ...(toAnthropicTools(tools) ? { tools: toAnthropicTools(tools) } : {}),
      stream: true,
      ...extra,
    });

    let currentToolId = "";

    const finishReasonMap: Record<string, FinishReason> = {
      end_turn: "stop",
      tool_use: "tool_use",
      max_tokens: "max_tokens",
    };

    for await (const event of response) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolId = event.content_block.id;
          yield {
            type: "tool_call_start",
            id: event.content_block.id,
            name: event.content_block.name,
          };
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "thinking_delta") {
          yield { type: "thinking", text: event.delta.thinking };
        } else if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          yield {
            type: "tool_call_delta",
            id: currentToolId,
            arguments: event.delta.partial_json,
          };
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolId) {
          yield { type: "tool_call_end", id: currentToolId };
          currentToolId = "";
        }
      } else if (event.type === "message_delta") {
        yield {
          type: "done",
          finish_reason: finishReasonMap[event.delta.stop_reason ?? "end_turn"] ?? "stop",
          usage: {
            input_tokens: 0,
            output_tokens: event.usage.output_tokens,
          },
        };
      }
    }
  }
}
