import Anthropic from "@anthropic-ai/sdk";
import type { AssistantMessage } from "../../types/messages";
import { LLMProvider, type ModelInvokeParams } from "../../types/provider";
import {
  AnthropicStreamAccumulator,
  convertToAnthropicMessages,
  convertToAnthropicTools,
  parseAssistantMessage,
} from "./utils";

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

export class AnthropicProvider extends LLMProvider {
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

  async invoke(params: ModelInvokeParams): Promise<AssistantMessage> {
    const { messages, tools: rawTools, options, signal } = params;
    const { system, messages: anthropicMessages } = await convertToAnthropicMessages(messages);

    const anthropicTools = rawTools ? convertToAnthropicTools(rawTools) : undefined;

    const response = await this.client.messages.create(
      {
        model: this.model,
        messages: anthropicMessages,
        max_tokens: 8192,
        system: system.length > 0 ? system : undefined,
        ...(anthropicTools ? { tools: anthropicTools } : {}),
        stream: false as const,
        ...options,
      },
      { signal },
    );

    return parseAssistantMessage(response);
  }

  async *stream(params: ModelInvokeParams): AsyncGenerator<AssistantMessage> {
    const { messages, tools: rawTools, options, signal } = params;
    const { system, messages: anthropicMessages } = await convertToAnthropicMessages(messages);
    const anthropicTools = rawTools ? convertToAnthropicTools(rawTools) : undefined;

    const raw = await this.client.messages.create(
      {
        model: this.model,
        messages: anthropicMessages,
        max_tokens: 8192,
        system: system.length > 0 ? system : undefined,
        ...(anthropicTools ? { tools: anthropicTools } : {}),
        stream: true as const,
        ...options,
      },
      { signal },
    );

    const acc = new AnthropicStreamAccumulator();
    for await (const event of raw) {
      acc.apply(event);
      // Only emit a snapshot on events that actually change renderable state
      // (deltas and block starts). Skip message_stop / content_block_stop.
      if (
        event.type === "content_block_start" ||
        event.type === "content_block_delta" ||
        event.type === "message_delta"
      ) {
        yield acc.snapshot();
      }
    }
  }
}
