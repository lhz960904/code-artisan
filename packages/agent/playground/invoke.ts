import "dotenv/config";
import { AnthropicProvider, createAgent } from "../src/index.js";

const provider = new AnthropicProvider("claude-sonnet-4-20250514", {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const agent = createAgent({ model: provider });

const response = await agent.invoke([{ role: "user", content: "用一句话介绍你自己" }]);

console.log("Content:", response.content);
console.log("Finish reason:", response.finish_reason);
console.log("Usage:", response.usage);
