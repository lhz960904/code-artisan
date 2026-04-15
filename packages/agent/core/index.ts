import os from "node:os";
import { join } from "path";
import { createSkillsMiddleware } from "../middlewares/skills";
import { bashTool, lsTool, globTool, grepTool, readFileTool, strReplaceTool, writeFileTool } from "../tools";
import type { Tool } from "../tools/tool";
import type { AgentOptions } from "../types";
import { Agent } from "./agent";
import { createTodoSystem } from "../middlewares/todo";
import { loopDetectionMiddleware } from "../middlewares/loop-detection";

function mergeTools(builtins: Tool[], userTools?: Tool[]): Tool[] {
  if (!userTools?.length) return builtins;
  const overrideNames = new Set(userTools.map((t) => t.name));
  return [...builtins.filter((t) => !overrideNames.has(t.name)), ...userTools];
}

export function createAgent(options: AgentOptions): Agent {
  const { skillsDirs = [join(os.homedir(), ".agents/skills")] } = options;

  const todoSystem = createTodoSystem();

  const middlewares = [
    createSkillsMiddleware(skillsDirs),
    todoSystem.middleware,
    loopDetectionMiddleware(),
    ...(options.middlewares ?? []),
  ];

  const agent = new Agent({
    prompt: options.prompt ?? "You are a helpful coding assistant.",
    model: options.model,
    maxSteps: options.maxSteps,
    tools: mergeTools(
      [bashTool, readFileTool, writeFileTool, strReplaceTool, globTool, grepTool, lsTool, todoSystem.tool],
      options.tools,
    ),
    middlewares: middlewares,
    sandbox: options.sandbox,
    initMessages: options.initMessages,
  });

  return agent;
}
