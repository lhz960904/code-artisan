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

/** LLM response (provider-agnostic) */
export interface LLMResponse {
  textContent: string;
  thinking?: string;
  toolCalls: ToolCall[];
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  messageId?: string;
}

/** streaming callbacks */
export interface StreamCallbacks {
  onTextDelta?: (text: string) => void;
  onThinkingDelta?: (text: string) => void;
  onToolCallStart?: (toolCall: ToolCall) => void;
  onToolCallDelta?: (toolCallId: string, argsDelta: string) => void;
}

/** LLM Provider interface */
export interface LLMProvider {
  /** streaming chat */
  chat(messages: Message[], tools: ToolDefinition[], systemPrompt: string, callbacks: StreamCallbacks): Promise<LLMResponse>;

  /** simple text generation (lightweight tasks like title generation) */
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
