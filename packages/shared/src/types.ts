// ============================================================
// Part Types - atomic content units, cutting across SSE / DB / UI
// ============================================================

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  mediaType: string;
  source: { type: "base64"; data: string } | { type: "url"; url: string };
}

export interface DocumentPart {
  type: "document";
  mediaType: string;
  title?: string;
  source: { type: "base64"; data: string } | { type: "url"; url: string } | { type: "text"; text: string };
}

export interface ThinkingPart {
  type: "thinking";
  thinking: string;
  signature?: string;
}

/**
 * state machine: partial-call → call → result / error
 */
export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  state: "partial-call" | "call" | "result" | "error";
  output?: string;
  approval?: "pending" | "approved" | "rejected";
}

export interface StepStartPart {
  type: "step-start";
  stepIndex: number;
}

export interface StepEndPart {
  type: "step-end";
  stepIndex: number;
  usage?: { inputTokens: number; outputTokens: number };
  finishReason?: string;
  model?: string;
}

/** 错误 */
export interface ErrorPart {
  type: "error";
  message: string;
}

export type MessagePart = TextPart | ImagePart | DocumentPart | ThinkingPart | ToolCallPart | StepStartPart | StepEndPart | ErrorPart;

// ============================================================
// Message - composed of parts
// ============================================================

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ============================================================
// SSE Stream - part-level streaming
// ============================================================

export interface StreamEvent {
  messageId: string;
  part: MessagePart;
}

/** text delta (streaming, not persisted) */
export interface StreamTextDelta {
  messageId: string;
  type: "text-delta";
  textDelta: string;
}

/** streaming data union type */
export type StreamData = StreamEvent | StreamTextDelta;

// ============================================================
// Conversation
// ============================================================

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  mode: "yolo" | "confirm";
  sandboxId: string | null;
  deployUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// API Types
// ============================================================

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  conversationId: string;
  status: "started";
}
