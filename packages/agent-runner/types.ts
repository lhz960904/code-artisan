import type { AssistantMessage, ToolMessage, UserMessage, NonSystemMessage, TokenUsage } from "@code-artisan/agent";

export interface InvokeRequest {
  message: UserMessage;
  history: NonSystemMessage[];
  files: FileSnapshot[];
  config: InvokeConfig;
}

export interface InvokeConfig {
  model: string;
  apiKey: string;
  baseURL?: string;
  prompt?: string;
  maxSteps?: number;
}

export interface FileSnapshot {
  path: string;
  content: string;
}

export type RunnerEvent =
  | { type: "assistant"; message: AssistantMessage }
  | { type: "tool"; message: ToolMessage }
  | { type: "file"; files: FileSnapshot[] }
  | { type: "done"; usage: TokenUsage }
  | { type: "error"; error: string };
