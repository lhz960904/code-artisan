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

export type FinishReason = 'stop' | 'tool_calls' | 'max_tokens' | 'error' | 'abort';

export type MessageStreamEvent =
  // -- Provider: three-phase text streaming --
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string; text: string }

  // -- Provider: three-phase thinking (CoT) streaming --
  | { type: 'thinking-start'; id: string }
  | { type: 'thinking-delta'; id: string; delta: string }
  | { type: 'thinking-end'; id: string; signature: string; text: string }

  // -- Provider: tool input streaming --
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; toolCallId: string; toolName: string; delta: string }
  | { type: 'tool-input-end'; toolCallId: string; toolName: string; text: string }

  // -- Provider: step lifecycle --
  | { type: 'step-start' }
  | { type: 'step-finish'; finishReason: FinishReason; usage: { inputTokens: number; outputTokens: number } }

  // -- Agent: tool execution results --
  | { type: 'tool-output'; toolCallId: string; toolName: string; state: 'result' | 'error'; output: string }
  | { type: 'tool-approval'; toolCallId: string; toolName: string; approval: 'pending' | 'approved' | 'rejected' }

  // -- Lifecycle & control --
  | { type: 'stream-finish' }
  | { type: 'error'; error: string }
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

export interface Attachment {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface SendMessageRequest {
  content: string;
  attachments?: Attachment[];
}

export interface SendMessageResponse {
  conversationId: string;
  status: "started";
}

// ============================================================
// MCP Types
// ============================================================

export interface McpEnvVar {
  name: string;
  label: string;
  placeholder: string;
  description: string;
  required: boolean;
}

export interface McpRegistryServer {
  id: string;
  name: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  command: string;
  args: string[];
  envVars: McpEnvVar[];
  docUrl: string;
}

export interface McpInstalledServer {
  id: string;
  serverId: string;
  envVars: Record<string, string>;
  installedAt: string;
  name: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  docUrl: string;
}

export interface McpServerListItem extends McpRegistryServer {
  installed: boolean;
  installedId?: string;
}
