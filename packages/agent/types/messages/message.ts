import type { AssistantMessageContent, SystemMessageContent, ToolMessageContent, UserMessageContent } from "./content";

/**
 * System prompt or policy text for the model.
 */
export interface SystemMessage {
  /** Discriminator: this turn carries system instructions or policy. */
  role: "system";
  /** Ordered segments of system text; see {@link SystemMessageContent}. */
  content: SystemMessageContent;
  /** Metadata stores business data or data from different llm providers */
  metadata?: Record<string, unknown>;
}

/**
 * End-user turn, including optional images.
 */
export interface UserMessage {
  /** Discriminator: this turn is from the end user. */
  role: "user";
  /** Text and/or image segments; see {@link UserMessageContent}. */
  content: UserMessageContent;
  /** Metadata stores business data or data from different llm providers */
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Model reply, which may include text, thinking blocks, or tool calls.
 */
export interface AssistantMessage {
  /** Discriminator: this turn is model-generated output. */
  role: "assistant";
  /** Text, optional reasoning, and/or tool calls; see {@link AssistantMessageContent}. */
  content: AssistantMessageContent;
  /** Provider-reported token usage for the request that produced this message, when available. */
  usage?: TokenUsage;
  /** Metadata stores business data or data from different llm providers */
  metadata?: Record<string, unknown>;
}

/**
 * Outcome of a tool execution, typically sent after an assistant tool call.
 */
export interface ToolMessage {
  /** Discriminator: this turn reports tool execution results. */
  role: "tool";
  /** Tool execution payloads, each referencing the originating tool call id; see {@link ToolMessageContent}. */
  content: ToolMessageContent;
  /** Metadata stores business data or data from different llm providers */
  metadata?: Record<string, unknown>;
}

/** A message that is not a system message. */
export type NonSystemMessage = UserMessage | AssistantMessage | ToolMessage;

/** Any supported chat message in a conversation transcript. */
export type Message = SystemMessage | NonSystemMessage;
