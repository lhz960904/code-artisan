import { AnthropicProvider, createAgent } from "../index";

const provider = new AnthropicProvider("claude-sonnet-4-20250514", {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const agent = createAgent({ model: provider });

const stream = agent.stream(
  [{ role: "user", content: [{ type: "text", text: "用三句话介绍 TypeScript 的优点" }] }],
  { thinking: { type: "enabled", budget_tokens: 16000 } },
);

for await (const event of stream) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "thinking":
      process.stdout.write(`${event.text}`);
      break;
    case "done":
      console.log(`\n\nFinish reason: ${event.finish_reason}`);
      console.log("Usage:", event.usage);
      break;
  }
}
