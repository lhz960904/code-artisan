import type { BaseProvider } from "./providers/base";
import type { DefinedTool } from "./tools/tool";
import type { Sandbox } from "./sandboxs/base";

export interface CreateAgentParams {
  /** LLM provider to use */
  model: BaseProvider;
  /** Tools available to the agent */
  tools?: DefinedTool[];
  /** Sandbox for tool execution. Defaults to LocalSandbox. */
  sandbox?: Sandbox;
  /** Max tool-call iterations to prevent infinite loops. Defaults to 100. */
  maxIterations?: number;
}
