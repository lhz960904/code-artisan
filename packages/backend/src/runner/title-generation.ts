import type { LLMProvider, UserMessage } from "@code-artisan/agent";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";

const MAX_TITLE_LENGTH = 60;

/**
 * Generate a conversation title from the first user message, iff
 * the conversation doesn't already have one. Runs BEFORE the main
 * agent starts (runner pre-step) so the UI shows a title immediately
 * instead of waiting for the agent to finish.
 *
 * Failures are swallowed — a missing title is a cosmetic issue, not
 * something to fail a run over.
 */
export async function generateConversationTitle(params: {
  conversationId: string;
  firstUserMessage: UserMessage;
  summaryModel: LLMProvider;
}): Promise<void> {
  const { conversationId, firstUserMessage, summaryModel } = params;

  const [conv] = await db
    .select({ title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (conv?.title) return;

  const userText = firstUserMessage.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  if (!userText) return;

  try {
    const response = await summaryModel.invoke({
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text: "Generate a very short title (max 6 words, no quotes, no trailing punctuation) for a coding conversation.",
            },
          ],
        },
        { role: "user", content: [{ type: "text", text: userText }] },
      ],
    });

    const title = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim()
      .slice(0, MAX_TITLE_LENGTH);
    if (!title) return;

    await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error(`[title-generation] failed:`, err);
  }
}
