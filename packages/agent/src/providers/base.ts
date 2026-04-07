// ---- Content Parts ----

export interface TextContentPart {
  type: "text";
  text: string;
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type DocumentMediaType =
  | "application/pdf"
  | "text/plain"
  | "text/html"
  | "text/csv"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface UrlSource {
  type: "url";
  url: string;
}

export interface Base64Source {
  type: "base64";
  media_type: ImageMediaType | DocumentMediaType;
  data: string;
}

export type ContentSource = UrlSource | Base64Source;

export interface ImageContentPart {
  type: "image";
  source: ContentSource;
}

export interface DocumentContentPart {
  type: "document";
  source: ContentSource;
}

export type ContentPart = TextContentPart | ImageContentPart | DocumentContentPart;

// ---- Messages ----

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: string | ContentPart[];
}

export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolMessage {
  role: "tool";
  content: string;
  tool_call_id: string;
}

export type MessageParam = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ---- Tool Call ----

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

// ---- Tool Definition ----

export interface ToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Tool {
  type: "function";
  function: ToolFunction;
}

// ---- Response ----

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export type FinishReason = "stop" | "tool_use" | "max_tokens";

export interface ChatResponse {
  id: string;
  content: string | null;
  thinking: string | null;
  tool_calls: ToolCall[];
  finish_reason: FinishReason;
  usage: Usage;
}

// ---- Stream Events ----

export type ChatStreamEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; arguments: string }
  | { type: "tool_call_end"; id: string }
  | { type: "tool_result"; id: string; name: string; output: string }
  | { type: "done"; finish_reason: FinishReason; usage: Usage };

// ---- Provider Base ----

export type BaseInvokeParams = {
  messages: MessageParam[];
} & Record<string, unknown>;

export abstract class BaseProvider {
  abstract invoke(params: BaseInvokeParams): Promise<ChatResponse>;
  abstract stream(params: BaseInvokeParams): AsyncIterable<ChatStreamEvent>;
}
