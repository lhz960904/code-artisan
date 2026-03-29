export { BaseTool, type ToolRuntime } from "./base.js";
export { toolRegistry } from "./registry.js";

// Register all builtin tools
import { toolRegistry } from "./registry.js";
import { BashTool } from "./builtins/bash.js";
import { LsTool } from "./builtins/ls.js";
import { ReadFileTool } from "./builtins/read-file.js";
import { WriteFileTool } from "./builtins/write-file.js";
import { StrReplaceTool } from "./builtins/str-replace.js";
import { StartServerTool } from "./builtins/start-server.js";

toolRegistry.register(new BashTool());
toolRegistry.register(new LsTool());
toolRegistry.register(new ReadFileTool());
toolRegistry.register(new WriteFileTool());
toolRegistry.register(new StrReplaceTool());
toolRegistry.register(new StartServerTool());
