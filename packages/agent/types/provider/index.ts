import type { Tool } from "../../tools/tool";
import type { AssistantMessage, Message, ToolMessage } from "../messages";
// import type { StreamEvent } from "../messages/stream";

export type ModelInvokeParams = {
  messages: Message[];
  tools?: Tool[];
  options?: Record<string, unknown>;
  signal?: AbortSignal;
};

export abstract class LLMProvider {
  abstract invoke(params: ModelInvokeParams): Promise<AssistantMessage>;
  // abstract stream(params: BaseInvokeParams): AsyncIterable<StreamEvent>;
}
