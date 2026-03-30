import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../../env.js";
import type { AgentMiddleware, AgentRuntime } from "../types.js";

/**
 * Auto-generates a conversation title after the first exchange.
 * Uses a lightweight model (haiku) for fast, cheap title generation.
 */
export class TitleGenerationMiddleware implements AgentMiddleware {
  name = "title-generation";

  async afterAgent(runtime: AgentRuntime): Promise<void> {
    // Check if conversation already has a title
    const [conv] = await db.select({ title: conversations.title }).from(conversations).where(eq(conversations.id, runtime.conversationId));

    if (conv?.title) return;

    // Find first user message
    const firstUserMsg = runtime.messages.find((m) => m.role === "user");
    if (!firstUserMsg) return;

    const userText = typeof firstUserMsg.content === "string" ? firstUserMsg.content : "";
    if (!userText) return;

    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `Generate a very short title (max 6 words, no quotes) for a coding conversation that starts with this message:\n\n${userText}`,
          },
        ],
      });

      const title = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      if (title) {
        await db.update(conversations).set({ title, updatedAt: new Date() }).where(eq(conversations.id, runtime.conversationId));
      }
    } catch (err) {
      console.error(`[title-generation] Failed: ${err}`);
    }
  }
}
