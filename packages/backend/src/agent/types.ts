import type { Sandbox } from "../sandbox/index.js";
import type { MessageStore } from "../services/message-store.js";
import type { Message, StreamData } from "@code-artisan/shared";

// ============================================================
// LLM Provider interface
// ============================================================

/** tool call */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** tool definition (JSON Schema) */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Thinking block with optional provider-specific signature */
export interface ThinkingBlock {
  thinking: string;
  signature?: string;
}

/** LLM response (provider-agnostic) */
export interface LLMResponse {
  textContent: string;
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCall[];
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  messageId?: string;
}

/** Return type of LLMProvider.stream() */
export interface ProviderStream {
  /** Async iterable of typed stream events; exhausted when LLM call completes */
  events: AsyncIterable<StreamData>;
  /** Resolves with the full LLM response once the stream is exhausted */
  response: Promise<LLMResponse>;
}

/** LLM Provider interface */
export interface LLMProvider {
  /** Streaming chat — returns an async iterable of typed events + a response promise */
  stream(messages: Message[], tools: ToolDefinition[], systemPrompt: string, messageId: string): ProviderStream;

  /** Simple text generation (lightweight tasks like title generation) */
  generateText(prompt: string): Promise<string>;
}

// ============================================================
// Agent Runtime & Config
// ============================================================

/** Agent runtime context */
export interface AgentRuntime {
  sandbox: Sandbox;
  conversationId: string;
  messages: Message[];
  mode: "yolo" | "confirm";
  state: Map<string, unknown>;
  store: MessageStore;
  provider: LLMProvider;
  emitStream: (data: StreamData) => void;
  usage: { inputTokens: number; outputTokens: number };
  shouldStop: boolean;
}

/** Agent config */
export interface AgentConfig {
  conversationId: string;
  userMessage?: string;
  maxIterations?: number;
}

// ============================================================
// Middleware
// ============================================================

/** Middleware lifecycle hooks */
export interface AgentMiddleware {
  name: string;
  beforeAgent?(runtime: AgentRuntime): Promise<void>;
  beforeModel?(runtime: AgentRuntime): Promise<void>;
  afterModel?(runtime: AgentRuntime, response?: LLMResponse): Promise<void>;
  afterToolExecution?(runtime: AgentRuntime): Promise<void>;
  onError?(runtime: AgentRuntime, error: Error): Promise<void>;
  afterAgent?(runtime: AgentRuntime): Promise<void>;
}
