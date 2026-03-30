export { Agent } from "./agent.js";
export type {
  AgentConfig,
  AgentMiddleware,
  AgentRuntime,
  LLMResponse,
  ToolCall,
} from "./types.js";

import { Agent } from "./agent.js";
import { DanglingToolCallMiddleware } from "./middlewares/dangling-tool-call.js";
import { TokenUsageMiddleware } from "./middlewares/token-usage.js";
import { LoopDetectionMiddleware } from "./middlewares/loop-detection.js";
import { TitleGenerationMiddleware } from "./middlewares/title-generation.js";

/** Create an Agent with default middleware stack. */
export function createAgent(): Agent {
  return new Agent([
    new DanglingToolCallMiddleware(),
    new TokenUsageMiddleware(),
    new LoopDetectionMiddleware(),
    new TitleGenerationMiddleware(),
  ]);
}
