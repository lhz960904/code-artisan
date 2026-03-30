import { db } from "../../db/index.js";
import { conversations } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { AgentMiddleware, AgentRuntime } from "../types.js";

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
      const title = await runtime.provider.generateText(
        `Generate a very short title (max 6 words, no quotes) for a coding conversation that starts with this message:\n\n${userText}`,
      );

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
