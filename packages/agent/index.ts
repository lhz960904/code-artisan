export { Agent } from "./core/agent";
export { createAgent } from "./core/index";
export { LLMProvider } from "./types/provider";
export type { ModelInvokeParams } from "./types/provider";
export { AnthropicProvider } from "./community/anthropic/index";
export type { AnthropicProviderOptions } from "./community/anthropic/index";

export { defineTool } from "./tools/tool";
export type { FunctionTool, ToolContext } from "./tools/tool";
export {
  bashTool,
  lsTool,
  readFileTool,
  writeFileTool,
  strReplaceTool,
  globTool,
  grepTool,
  webSearchTool,
  webFetchTool,
} from "./tools/index";

export * from "./types";
export * from "./sandbox";

export {
  composeSystemPrompt,
  DEFAULT_IDENTITY,
  SYSTEM_SECTION,
  DOING_TASKS_SECTION,
  EXECUTING_ACTIONS_SECTION,
  USING_TOOLS_SECTION,
  TONE_STYLE_SECTION,
  COMMUNICATING_SECTION,
} from "./prompts";
export type { SystemPromptOptions } from "./prompts";

export { loopDetectionMiddleware } from "./middlewares/loop-detection";
export type { LoopDetectionOptions } from "./middlewares/loop-detection";
export { microCompactMiddleware } from "./middlewares/micro-compact";
export type { MicroCompactOptions } from "./middlewares/micro-compact";
export { autoCompactMiddleware } from "./middlewares/auto-compact";
export type { AutoCompactOptions } from "./middlewares/auto-compact";
