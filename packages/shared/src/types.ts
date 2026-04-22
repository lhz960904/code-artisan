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
  | { type: "title_update"; title: string }
  | { type: "quota_exceeded" }
  | { type: "file_update"; files: Array<{ path: string; content: string }> }
  | { type: "file_delete"; paths: string[] }
  | { type: "terminal_start"; id: string; command: string }
  | { type: "terminal_chunk"; id: string; stream: "stdout" | "stderr"; data: string }
  | { type: "terminal_exit"; id: string; exitCode: number }
  | { type: "error"; message: string };

export type TerminalStatus = "running" | "idle" | "error" | "exited";

/** Summary of a managed terminal session, returned by terminal_list tool. */
export interface TerminalSessionInfo {
  id: string;
  label: string;
  status: TerminalStatus;
  exitCode?: number;
  /** Last ~20 lines of output (ANSI stripped) for AI to read. */
  outputTail: string;
}

/** WebSocket messages: client → server */
export type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "signal"; signal: "SIGINT" | "SIGTERM" };

/** WebSocket messages: server → client */
export type TerminalServerMessage =
  | { type: "output"; sessionId: string; data: number[] }
  | { type: "session_update"; session: TerminalSessionInfo }
  | { type: "history"; data: number[] };

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
