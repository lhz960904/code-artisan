// ============================================================
// Part Types - atomic content units, cutting across SSE / DB / UI
// ============================================================

export interface TextPart {
  type: "text";
  text: string;
  status?: "streaming" | "done";
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
  status?: "streaming" | "done";
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
// SSE Stream - discriminated union of all event types
// ============================================================

export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error' | 'abort';

export type StreamData =
  // ── 消息内容 ───────────────────────────────────
  | { type: 'part'; messageId: string; role?: MessageRole; part: MessagePart }

  // ── 生命周期 ───────────────────────────────────
  | { type: 'step-start'; stepIndex: number }
  | { type: 'step-finish'; stepIndex: number; finishReason: FinishReason; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'stream-finish' }

  // ── 错误与控制 ─────────────────────────────────
  | { type: 'error'; error: string; code?: string }
  | { type: 'abort' }
  | { type: 'ping' };

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
