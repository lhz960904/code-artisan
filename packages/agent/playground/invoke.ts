import { AnthropicProvider, createAgent } from "../index";

const provider = new AnthropicProvider("claude-sonnet-4-20250514", {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const agent = createAgent({ model: provider });

const response = await agent.invoke([
  { role: "user", content: [{ type: "text", text: "用一句话介绍你自己" }] },
]);

const text = response.content.find((c) => c.type === "text");
console.log("Content:", text?.type === "text" ? text.text : null);
