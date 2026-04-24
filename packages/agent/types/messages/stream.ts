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
 * Terminal lifecycle event: fired when the agent run stops early in
 * response to `Agent.abort()`. Any partial assistant output is first
 * promoted to a regular `message` event (with `metadata.interrupted = true`)
 * so consumers never have to reconstruct dropped state; this event is the
 * trailing signal that the run ended by interruption rather than natural
 * completion. No further events follow.
 *
 * This is a **terminal** lifecycle event. Future non-terminal lifecycle
 * events (e.g. `tool_approval_required`, where the run pauses awaiting
 * an external decision and then continues) will be added as sibling
 * variants of `AgentEvent` and should not be conflated with this one —
 * they share the "lifecycle" category but differ in terminality and in
 * whether they carry a resume callback.
 */
export interface AgentInterruptedEvent {
  type: "interrupted";
  reason?: unknown;
}

/**
 * Events yielded by `Agent.stream()`. The stream ends naturally when the
 * generator returns (= done). Errors surface by throwing from the generator.
 */
export type AgentEvent = AgentPartialEvent | AgentMessageEvent | AgentInterruptedEvent;
