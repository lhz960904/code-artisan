export { SANDBOX_WORKSPACE_ROOT, SANDBOX_IGNORED_DIRS } from "./constants";

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
  | { type: "quota_exceeded" }
  | { type: "file_update"; files: Array<{ path: string; content: string }> }
  | { type: "file_delete"; paths: string[] }
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
