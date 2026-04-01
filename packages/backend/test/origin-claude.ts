import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });


const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
  baseURL: "https://openrouter.ai/api"
});


const stream = client.messages.stream({
  model: "claude-opus-4-6",
  max_tokens: 20000,
  thinking: { type: "enabled", budget_tokens: 16000 },
  messages: [
    {
      role: "user",
      content: "What is the greatest common divisor of 1071 and 462?"
    }
  ]
});

for await (const event of stream) {
  if (event.type === "content_block_delta") {
    if (event.delta.type === "thinking_delta") {
      console.log(event.index, event.delta.thinking);
    } else if (event.delta.type === "text_delta") {
      console.log(event.index, event.delta.text);
    }
  }
}
