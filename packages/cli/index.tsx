import { render } from "ink";

import {
  Agent,
  AnthropicProvider,
  bashTool,
  readFileTool,
  writeFileTool,
  strReplaceTool,
  globTool,
  grepTool,
  lsTool,
} from "@code-artisan/agent";

import { App } from "./tui/app";
import { AgentLoopProvider } from "./tui/hooks/use-agent-loop";

const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const provider = new AnthropicProvider(model, {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const agent = new Agent({
  prompt: "You are a helpful coding assistant.",
  model: provider,
  tools: [bashTool, readFileTool, writeFileTool, strReplaceTool, globTool, grepTool, lsTool],
});

console.info();

render(
  <AgentLoopProvider agent={agent}>
    <App />
  </AgentLoopProvider>,
);
