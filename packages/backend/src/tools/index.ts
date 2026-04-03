export { BaseTool, type ToolRuntime } from "./base.js";
export { ToolRegistry } from "./registry.js";

import { ToolRegistry } from "./registry.js";
import { BashTool } from "./builtins/bash.js";
import { LsTool } from "./builtins/ls.js";
import { ReadFileTool } from "./builtins/read-file.js";
import { WriteFileTool } from "./builtins/write-file.js";
import { StrReplaceTool } from "./builtins/str-replace.js";
import { StartServerTool } from "./builtins/start-server.js";
import { WebSearchTool } from "./builtins/web-search.js";
import { WebFetchTool } from "./builtins/web-fetch.js";
import { env } from "../env.js";

/** Create a new ToolRegistry with all builtin tools registered. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new BashTool());
  registry.register(new LsTool());
  registry.register(new ReadFileTool());
  registry.register(new WriteFileTool());
  registry.register(new StrReplaceTool());
  registry.register(new StartServerTool());

  if (env.TAVILY_API_KEY) {
    registry.register(new WebSearchTool(env.TAVILY_API_KEY));
    registry.register(new WebFetchTool(env.TAVILY_API_KEY));
  }

  return registry;
}
