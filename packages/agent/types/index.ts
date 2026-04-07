import type { BaseProvider } from "./provider/base";
import type { FunctionTool } from "../tools/tool";
import type { Sandbox } from "../sandbox/base";

export interface CreateAgentParams {
  /** LLM provider to use */
  model: BaseProvider;  
  /** Tools available to the agent */
  tools?: FunctionTool[];
  /** Sandbox for tool execution. Defaults to LocalSandbox. */
  sandbox?: Sandbox;
  /** Max tool-call iterations to prevent infinite loops. Defaults to 100. */
  maxIterations?: number;
}

/**
 * Runtime context injected into tool execute functions.
 * Provided by the agent loop at execution time, not at definition time.
 */
export interface AgentContext {
  sandbox: Sandbox;
}



