export { Agent } from "./agent.js";
export type {
  AgentConfig,
  AgentMiddleware,
  AgentRuntime,
  LLMProvider,
  LLMResponse,
  ToolCall,
  ToolDefinition,
  StreamCallbacks,
} from "./types.js";
export { ClaudeProvider } from "./providers/claude.js";

import { Agent } from "./agent.js";
import type { LLMProvider } from "./types.js";
import { ClaudeProvider } from "./providers/claude.js";
import { DanglingToolCallMiddleware } from "./middlewares/dangling-tool-call.js";
import { TokenUsageMiddleware } from "./middlewares/token-usage.js";
import { LoopDetectionMiddleware } from "./middlewares/loop-detection.js";
import { TitleGenerationMiddleware } from "./middlewares/title-generation.js";

/** Create an Agent with default middleware stack. */
export function createAgent(provider?: LLMProvider): Agent {
  const llm = provider ?? new ClaudeProvider();
  return new Agent(llm, [
    new DanglingToolCallMiddleware(),
    new TokenUsageMiddleware(),
    new LoopDetectionMiddleware(),
    new TitleGenerationMiddleware(),
  ]);
}
