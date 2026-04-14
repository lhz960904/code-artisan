import type { Tool } from "../../tools/tool";
import type { AssistantMessage, Message } from "../messages";

export type ModelInvokeParams = {
  messages: Message[];
  tools?: Tool[];
  options?: Record<string, unknown>;
  signal?: AbortSignal;
};

export abstract class LLMProvider {
  /**
   * Non-streaming call. Returns the final assistant message in one shot.
   */
  abstract invoke(params: ModelInvokeParams): Promise<AssistantMessage>;

  /**
   * Streaming call. Yields progressively complete `AssistantMessage`
   * snapshots. Each yielded message is self-consistent and supersedes the
   * previous one. The last yielded snapshot must equal what `invoke` would
   * have returned for the same params.
   */
  abstract stream(params: ModelInvokeParams): AsyncGenerator<AssistantMessage>;
}
