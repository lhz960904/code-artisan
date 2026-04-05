import type { Sandbox } from "../sandboxs/base";

/**
 * Runtime context injected into tool execute functions.
 * Provided by the agent loop at execution time, not at definition time.
 */
export interface ToolRuntime {
  sandbox: Sandbox;
}

/**
 * Result of a tool call — always succeeds at the transport level.
 * `success: false` means the tool errored, but the error message
 * is still returned to the LLM so it can retry or adjust.
 */
export interface ToolCallResult {
  success: boolean;
  output: string;
}
