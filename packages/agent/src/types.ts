import type { BaseProvider } from "./providers/base";

export interface CreateAgentParams {
  /** llm provider to use */
  model: BaseProvider;
}
