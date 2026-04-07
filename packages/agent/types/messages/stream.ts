
import type { AssistantMessage, Message } from "./message";


export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export type FinishReason = "stop" | "tool_use" | "max_tokens";

export type StreamEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; arguments: string }
  | { type: "tool_call_end"; id: string }
  | { type: "tool_result"; id: string; name: string; output: string }
  | { type: "done"; finish_reason: FinishReason; usage: Usage };
