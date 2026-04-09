import Anthropic from "@anthropic-ai/sdk";
import type { AssistantMessage } from "../../types/messages";
import { LLMProvider, type ModelInvokeParams } from "../../types/provider";
import { convertToAnthropicMessages, convertToAnthropicTools, parseAssistantMessage } from "./utils";

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
    const { system, messages: anthropicMessages } = convertToAnthropicMessages(messages);

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
}
