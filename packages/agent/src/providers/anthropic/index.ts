import { Anthropic } from "@anthropic-ai/sdk";
import { BaseProvider, type BaseInvokeParams, type ChatResponse, type ChatStreamEvent, type MessageParam, type Tool, type ToolCall } from "../base";

type AnthropicMessageParam = Anthropic.Messages.MessageParam;
type AnthropicTool = Anthropic.Messages.Tool;

// ---- Conversion: Custom → Anthropic ----

function toAnthropicMessages(messages: MessageParam[]): {
  system: string | undefined;
  messages: AnthropicMessageParam[];
} {
  let system: string | undefined;
  const out: AnthropicMessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = msg.content;
      continue;
    }

    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        out.push({ role: "user", content: msg.content });
      } else {
        const blocks = msg.content.map((part): Anthropic.Messages.ContentBlockParam => {
          if (part.type === "text") {
            return { type: "text", text: part.text };
          }
          if (part.type === "image") {
            return {
              type: "image",
              source: part.source as Anthropic.Messages.ImageBlockParam["source"],
            };
          }
          // document
          return {
            type: "document",
            source: part.source as Anthropic.Messages.DocumentBlockParam["source"],
          };
        });
        out.push({ role: "user", content: blocks });
      }
      continue;
    }

    if (msg.role === "assistant") {
      const blocks: Anthropic.Messages.ContentBlockParam[] = [];
      if (msg.content) {
        blocks.push({ type: "text", text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    if (msg.role === "tool") {
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: msg.content,
          },
        ],
      });
    }
  }

  return { system, messages: out };
}

function toAnthropicTools(tools?: Tool[]): AnthropicTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Messages.Tool.InputSchema,
  }));
}

// ---- Conversion: Anthropic → Custom ----

function fromAnthropicResponse(msg: Anthropic.Messages.Message): ChatResponse {
  let content: string | null = null;
  let thinking: string | null = null;
  const toolCalls: ToolCall[] = [];

  for (const block of msg.content) {
    if (block.type === "thinking") {
      thinking = (thinking ?? "") + block.thinking;
    } else if (block.type === "text") {
      content = (content ?? "") + block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  const finishReasonMap: Record<string, ChatResponse["finish_reason"]> = {
    end_turn: "stop",
    tool_use: "tool_use",
    max_tokens: "max_tokens",
  };

  return {
    id: msg.id,
    content,
    thinking,
    tool_calls: toolCalls,
    finish_reason: finishReasonMap[msg.stop_reason ?? "end_turn"] ?? "stop",
    usage: {
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    },
  };
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

  async invoke(params: BaseInvokeParams): Promise<ChatResponse> {
    const { messages, max_tokens: rawMaxTokens, tools: rawTools, system: rawSystem, ...extra } = params;
    const { system: extractedSystem, messages: anthropicMessages } = toAnthropicMessages(messages);
    const max_tokens = (rawMaxTokens as number | undefined) ?? 4096;
    const tools = rawTools as Tool[] | undefined;
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

  async *stream(params: BaseInvokeParams): AsyncIterable<ChatStreamEvent> {
    const { messages, max_tokens: rawMaxTokens, tools: rawTools, system: rawSystem, ...extra } = params;
    const { system: extractedSystem, messages: anthropicMessages } = toAnthropicMessages(messages);
    const max_tokens = (rawMaxTokens as number | undefined) ?? 4096;
    const tools = rawTools as Tool[] | undefined;
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
        const finishReasonMap: Record<string, ChatResponse["finish_reason"]> = {
          end_turn: "stop",
          tool_use: "tool_use",
          max_tokens: "max_tokens",
        };
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
