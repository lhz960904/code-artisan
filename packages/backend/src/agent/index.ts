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
export { AnthropicProvider } from "./providers/anthropic/index.js";

import { Agent } from "./agent.js";
import type { LLMProvider } from "./types.js";
import { AnthropicProvider } from "./providers/anthropic/index.js";
import { DanglingToolCallMiddleware } from "./middlewares/dangling-tool-call.js";
import { MicroCompactMiddleware } from "./middlewares/micro-compact.js";
import { AutoCompactMiddleware } from "./middlewares/auto-compact.js";
import { TokenUsageMiddleware } from "./middlewares/token-usage.js";
import { LoopDetectionMiddleware } from "./middlewares/loop-detection.js";
import { TitleGenerationMiddleware } from "./middlewares/title-generation.js";

/** Create an Agent with default middleware stack. */
export function createAgent(provider?: LLMProvider): Agent {
  const llm = provider ?? new AnthropicProvider();
  return new Agent(llm, [
    new DanglingToolCallMiddleware(),
    new MicroCompactMiddleware(),      // L1: prune old tool outputs
    new AutoCompactMiddleware(),       // L2: LLM summarization when over threshold
    new TokenUsageMiddleware(),
    new LoopDetectionMiddleware(),
    new TitleGenerationMiddleware(),
  ]);
}
