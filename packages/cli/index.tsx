import { render } from "ink";
import { createAgent, AnthropicProvider } from "@code-artisan/agent";

import { App } from "./tui/app";
import { AgentLoopProvider } from "./tui/hooks/use-agent-loop";
import { join } from "node:path";

const model = process.env.MODEL ?? "minimax-m2.5";

const provider = new AnthropicProvider(model, {
  apiKey: process.env.API_KEY,
  baseURL: process.env.BASE_URL,
});

const agent = createAgent({
  model: provider,
  skillsDirs: [join(process.cwd(), "skills")],
});

render(
  <AgentLoopProvider agent={agent}>
    <App />
  </AgentLoopProvider>,
);
