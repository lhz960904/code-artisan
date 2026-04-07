import type { AssistantMessage, Message } from "../messages";
import type { StreamEvent } from "../messages/stream";

export type BaseInvokeParams = {
  messages: Message[];
} & Record<string, unknown>;

export abstract class BaseProvider {
  abstract invoke(params: BaseInvokeParams): Promise<AssistantMessage>;
  abstract stream(params: BaseInvokeParams): AsyncIterable<StreamEvent>;
}
