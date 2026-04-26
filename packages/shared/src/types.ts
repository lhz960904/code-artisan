export { SANDBOX_WORKSPACE_ROOT, SANDBOX_IGNORED_DIRS } from "./constants";
export { SUPPORTED_MODELS, DEFAULT_MODEL_ID, findModel, type ModelInfo, type ModelProvider } from "./models";

export type {
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  NonSystemMessage,
  TextContent,
  ImageURLContent,
  FileContent,
  FileData,
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
  AgentPartialEvent,
  AgentMessageEvent,
} from "@code-artisan/agent";

/**
 * A stored message: an agent-package Message plus the business
 * metadata the backend/frontend need (row id, conversation link,
 * timestamps, optional metadata).
 */
export type StoredMessage<M extends Message = Message> = M & {
  id: string;
  conversationId: string;
  createdAt: string;
};
export type StoredSystemMessage = StoredMessage<SystemMessage>;
export type StoredUserMessage = StoredMessage<UserMessage>;
export type StoredAssistantMessage = StoredMessage<AssistantMessage>;
export type StoredToolMessage = StoredMessage<ToolMessage>;

export interface Attachment {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

// Stored as JSONB on `conversations.settings`; add fields here to surface end-to-end.
export interface ConversationSettings {
  systemPrompt?: string;
}

/**
 * Web transport wraps agent stream events with the server-side message id
 * so the frontend can key state by the db UUID from birth instead of
 * minting throwaway client ids.
 */
export type WebAgentPartialEvent = AgentPartialEvent & { messageId: string };
export type WebAgentMessageEvent = AgentMessageEvent & { messageId: string };

export type WebAgentEvent =
  | WebAgentPartialEvent
  | WebAgentMessageEvent
  | { type: "user_message_saved"; messageId: string }
  | { type: "title_update"; title: string }
  | { type: "quota_exceeded" }
  | { type: "file_update"; files: Array<{ path: string; content: string }> }
  | { type: "file_delete"; paths: string[] }
  | { type: "interrupted"; reason?: unknown }
  | { type: "error"; message: string };

/**
 * ------------------------------------------------------------
 * MCP Types
 * ------------------------------------------------------------
 */
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

export interface McpServerListItem extends McpRegistryServer {
  installed: boolean;
}
