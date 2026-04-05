import type { MessageParam, ChatResponse, ChatStreamEvent, BaseInvokeParams } from "./providers/base";
import type { CreateAgentParams } from "./types";

export function createAgent(params: CreateAgentParams) {
  const { model: provider } = params;

  return {
    invoke: async (
      messages: MessageParam[],
      options?: Omit<Partial<BaseInvokeParams>, "messages">,
    ): Promise<ChatResponse> => {
      return provider.invoke({
        messages,
        max_tokens: 4096,
        ...options,
      });
    },

    stream: (
      messages: MessageParam[],
      options?: Omit<Partial<BaseInvokeParams>, "messages">,
    ): AsyncIterable<ChatStreamEvent> => {
      return provider.stream({
        messages,
        max_tokens: 4096,
        ...options,
      });
    },
  };
}
