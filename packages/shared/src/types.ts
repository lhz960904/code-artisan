// ============================================================
// Message types — re-exported from the agent package.
// shared does NOT define its own message/content types anymore;
// the backend stores and the frontend renders agent-package shape.
// ============================================================

export type {
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  NonSystemMessage,
  TextContent,
  ImageURLContent,
  ThinkingContent,
  ToolUseContent,
  ToolResultContent,
  SystemMessageContent,
  UserMessageContent,
  AssistantMessageContent,
  ToolMessageContent,
} from "@code-artisan/agent";

import type {
  Message,
  AssistantMessage,
  UserMessage,
  ToolMessage,
  SystemMessage,
} from "@code-artisan/agent";

/**
 * A stored message: an agent-package Message plus the business
 * metadata the backend/frontend need (row id, conversation link,
 * timestamps, optional metadata).
 *
 * The generic narrows to one of the four role-tagged shapes when
 * useful: `StoredMessage<AssistantMessage>` etc.
 */
export type StoredMessage<M extends Message = Message> = M & {
  id: string;
  conversationId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type StoredSystemMessage = StoredMessage<SystemMessage>;
export type StoredUserMessage = StoredMessage<UserMessage>;
export type StoredAssistantMessage = StoredMessage<AssistantMessage>;
export type StoredToolMessage = StoredMessage<ToolMessage>;

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
// SSE events streamed from backend → frontend during an agent run.
// Intentionally coarse: each event carries a whole stored message
// rather than partial deltas. Token-level streaming is a separate
// concern (see agent package roadmap).
// ============================================================

export type AgentSseEvent =
  | { type: "message"; message: StoredMessage }
  | { type: "file"; files: Array<{ path: string; content: string }> }
  | { type: "done" }
  | { type: "error"; error: string };

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
