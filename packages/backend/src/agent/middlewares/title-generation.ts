import { db } from "../../db/index.js";
import { conversations } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { AgentMiddleware, AgentRuntime } from "../types.js";

const LIGHT_MODEL = "claude-haiku-4-5-20251001";

export class TitleGenerationMiddleware implements AgentMiddleware {
  name = "title-generation";

  async afterAgent(runtime: AgentRuntime): Promise<void> {
    const [conv] = await db
      .select({ title: conversations.title })
      .from(conversations)
      .where(eq(conversations.id, runtime.conversationId));

    if (conv?.title) return;

    const firstUserMsg = runtime.messages.find((m) => m.role === "user");
    if (!firstUserMsg) return;

    const userText = firstUserMsg.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (!userText) return;

    try {
      const title = await runtime.provider.generateText({
        model: LIGHT_MODEL,
        system: "Generate a very short title (max 6 words, no quotes) for a coding conversation.",
        messages: [{
          id: "title-prompt",
          role: "user",
          parts: [{ type: "text", text: userText }],
          createdAt: new Date().toISOString(),
        }],
      });

      if (title) {
        await db
          .update(conversations)
          .set({ title, updatedAt: new Date() })
          .where(eq(conversations.id, runtime.conversationId));
      }
    } catch (err) {
      console.error(`[title-generation] Failed: ${err}`);
    }
  }
}
