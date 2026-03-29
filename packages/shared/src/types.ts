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

// Tool call/result payloads
export interface ToolCallData {
  tool: string;
  args: Record<string, string>;
}

export interface ToolResultData {
  tool: string;
  output: string;
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
