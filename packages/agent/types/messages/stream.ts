import type { AssistantMessage, ToolMessage } from "./message";

/**
 * Fired while the current assistant turn is still being generated.
 * `message` is a complete, self-consistent snapshot of everything the model
 * has produced so far in the current step. Each yield supersedes the last —
 * consumers should replace by message identity, not append.
 *
 * A tool_use block whose input JSON is still streaming may carry a partial
 * `input` object (falls back to `{}` until the JSON is well-formed).
 */
export interface AgentPartialEvent {
  type: "partial";
  message: AssistantMessage;
}

/**
 * Fired once per fully-formed message: either the final assistant message
 * of a step, or a tool message produced locally after tool execution.
 * `ToolMessage` is always atomic — there is no partial form of it.
 */
export interface AgentMessageEvent {
  type: "message";
  message: AssistantMessage | ToolMessage;
}

/**
 * Events yielded by `Agent.stream()`. The stream ends naturally when the
 * generator returns (= done). Errors surface by throwing from the generator.
 */
export type AgentEvent = AgentPartialEvent | AgentMessageEvent;
