import type Anthropic from "@anthropic-ai/sdk";
import type { Sandbox } from "../sandbox/index.js";
import type { MessageStore } from "../services/message-store.js";
import type { Message, StreamData } from "@code-artisan/shared";

/**
 * LLM response — currently aliases Anthropic.Message directly.
 * Zero information loss. When multi-LLM support is added,
 * this becomes an adapter layer without changing middleware signatures.
 */
export type LLMResponse = Anthropic.Message;

/** Extracted tool call for convenience */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// --- LLMResponse utility functions ---

export function getToolCalls(response: LLMResponse): ToolCall[] {
  return response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));
}

export function getTextContent(response: LLMResponse): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export function getThinking(response: LLMResponse): string | undefined {
  const blocks = response.content.filter((b) => b.type === "thinking");
  if (blocks.length === 0) return undefined;
  return blocks.map((b) => (b as { type: "thinking"; thinking: string }).thinking).join("\n");
}

export function hasToolCalls(response: LLMResponse): boolean {
  return response.stop_reason === "tool_use";
}

/** Agent runtime context — shared across middlewares and tool execution */
export interface AgentRuntime {
  // Core
  sandbox: Sandbox;
  conversationId: string;

  // Conversation state
  messages: Message[];
  mode: "yolo" | "confirm";

  // Middleware shared state
  state: Map<string, unknown>;

  // Services
  store: MessageStore;
  emitStream: (data: StreamData) => void;

  // Accumulated usage
  usage: { inputTokens: number; outputTokens: number };

  // Control flow
  shouldStop: boolean;
}

/** Agent configuration */
export interface AgentConfig {
  conversationId: string;
  userMessage?: string;
  maxIterations?: number;
}

/** Middleware lifecycle hooks */
export interface AgentMiddleware {
  name: string;

  /** Before agent starts (fix history, init state) */
  beforeAgent?(runtime: AgentRuntime): Promise<void>;

  /** Before each LLM call */
  beforeModel?(runtime: AgentRuntime): Promise<void>;

  /** After each LLM call (loop detection, token tracking) */
  afterModel?(runtime: AgentRuntime, response?: LLMResponse): Promise<void>;

  /** After tool execution completes (success or failure) */
  afterToolExecution?(runtime: AgentRuntime): Promise<void>;

  /** On error during agent loop (logging, metrics, recovery) */
  onError?(runtime: AgentRuntime, error: Error): Promise<void>;

  /** After agent finishes (title generation, cleanup) */
  afterAgent?(runtime: AgentRuntime): Promise<void>;
}
