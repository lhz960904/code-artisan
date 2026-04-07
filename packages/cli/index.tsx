import { render } from "ink";

import {
  AnthropicProvider,
  createAgent,
  createBashTool,
  createReadFileTool,
  createWriteFileTool,
  createStrReplaceTool,
  createGlobTool,
  createGrepTool,
  createLsTool,
  LocalSandbox,
} from "@code-artisan/agent";

import { App } from "./tui/app";
import { AgentLoopProvider } from "./tui/hooks/use-agent-loop";

const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const provider = new AnthropicProvider(model, {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const sandbox = new LocalSandbox();

const agent = createAgent({
  model: provider,
  sandbox,
  tools: [
    createBashTool(sandbox),
    createReadFileTool(sandbox),
    createWriteFileTool(sandbox),
    createStrReplaceTool(sandbox),
    createGlobTool(sandbox),
    createGrepTool(sandbox),
    createLsTool(sandbox),
  ],
});

console.info();

render(
  <AgentLoopProvider agent={agent}>
    <App />
  </AgentLoopProvider>,
);
