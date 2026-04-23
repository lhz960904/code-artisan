import OpenAI from "openai";
import type { AssistantMessage } from "../../types/messages";
import { LLMProvider, type ModelInvokeParams } from "../../types/provider";
import {
  OpenAIStreamAccumulator,
  convertToOpenAIMessages,
  convertToOpenAITools,
  parseAssistantMessage,
} from "./utils";

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(model: string, options?: OpenAIProviderOptions) {
    super();
    this.model = model;
    this.client = new OpenAI({
      apiKey: options?.apiKey,
      baseURL: options?.baseURL,
    });
  }

  async invoke(params: ModelInvokeParams): Promise<AssistantMessage> {
    const { messages, tools: rawTools, options, signal } = params;
    const openaiMessages = await convertToOpenAIMessages(messages);
    const openaiTools = rawTools ? convertToOpenAITools(rawTools) : undefined;

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: openaiMessages,
        ...(openaiTools ? { tools: openaiTools } : {}),
        stream: false as const,
        ...options,
      },
      { signal },
    );

    return parseAssistantMessage(response);
  }

  async *stream(params: ModelInvokeParams): AsyncGenerator<AssistantMessage> {
    const { messages, tools: rawTools, options, signal } = params;
    const openaiMessages = await convertToOpenAIMessages(messages);
    const openaiTools = rawTools ? convertToOpenAITools(rawTools) : undefined;

    const raw = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: openaiMessages,
        ...(openaiTools ? { tools: openaiTools } : {}),
        stream: true as const,
        // Emits a final usage-only chunk so the accumulator can report
        // input/output tokens alongside the last snapshot.
        stream_options: { include_usage: true },
        ...options,
      },
      { signal },
    );

    const acc = new OpenAIStreamAccumulator();
    for await (const chunk of raw) {
      acc.apply(chunk);
      yield acc.snapshot();
    }
  }
}
