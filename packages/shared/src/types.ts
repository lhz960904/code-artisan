// Event types flowing through the system
export type EventType = "user_message" | "ai_text" | "tool_call" | "tool_result" | "confirm_required" | "confirm_response" | "preview_url" | "error";

export interface AgentEvent {
  id: string;
  conversationId: string;
  seq: number;
  type: EventType;
  data: Record<string, unknown>;
  createdAt: string;
}

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

// AI Tool definitions
export const TOOL_DEFINITIONS = [
  {
    name: "read_file",
    description: "Read the content of a file at the given path in the sandbox.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "Absolute file path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path in the sandbox. Creates directories as needed.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "Absolute file path to write" },
        content: { type: "string" as const, description: "File content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "execute_command",
    description: "Execute a shell command in the sandbox and return stdout/stderr.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string" as const, description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "list_files",
    description: "List files and directories at the given path in the sandbox.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "Directory path to list" },
      },
      required: ["path"],
    },
  },
  {
    name: "start_server",
    description: "Start a long-running server process in the background (e.g. node server.js, python -m http.server). Returns a public preview URL. Use this instead of execute_command for any command that starts a web server or long-running process.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string" as const, description: "Shell command to start the server" },
        port: { type: "number" as const, description: "Port the server listens on" },
      },
      required: ["command", "port"],
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

// Tool call/result payloads
export interface ToolCallData {
  tool: string;
  args: Record<string, string>;
}

export interface ToolResultData {
  tool: string;
  output: string;
  error?: string;
}

// Confirm mode payloads
export interface ConfirmRequiredData {
  tool: string;
  args: Record<string, string>;
  description: string;
}

export interface ConfirmResponseData {
  approved: boolean;
}

// API request/response types
export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  conversationId: string;
  status: "started";
}
