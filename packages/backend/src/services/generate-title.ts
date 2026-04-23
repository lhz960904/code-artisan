import type { LLMProvider, UserMessage } from "@code-artisan/agent";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db";
import { conversations } from "../db/schema";
import { createModelProvider } from "./model-provider";

type Conversation = typeof conversations.$inferSelect;

const TITLE_MAX_TOKENS = 1000;
const TITLE_MAX_CHARS = 80;

const TITLE_PROMPT = [
  "Give a concise 3-6 word title for the following user request.",
  "Match the user's language (e.g. Chinese stays Chinese, English stays English).",
  "No quotes, no trailing punctuation — just the title text.",
].join(" ");

function extractUserText(message: UserMessage): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text" && block.text) parts.push(block.text);
  }
  return parts.join("\n").trim();
}

async function callModel(model: LLMProvider, userMessage: UserMessage): Promise<string | null> {
  const text = extractUserText(userMessage);
  if (!text) return null;

  try {
    const res = await model.invoke({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${TITLE_PROMPT}\n\n${text}` }],
        },
      ],
      options: {
        max_tokens: TITLE_MAX_TOKENS,
      },
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const title = block.text
      .trim()
      .replace(/^["'「『《]+|["'」』》]+$/g, "")
      .replace(/[。.!！?？]+$/g, "")
      .trim();
    if (!title || title.length > TITLE_MAX_CHARS) return null;
    return title;
  } catch (err) {
    console.error("[generateTitle] LLM call failed:", err);
    return null;
  }
}

/**
 * Generate and persist a concise title for the conversation if it doesn't have
 * one yet. Returns the title on success (only when this call was the one that
 * wrote it), null otherwise — so the caller can decide whether to emit a
 * `title_update` event on this stream.
 *
 * Concurrency safety: the DB update guards with `title IS NULL` and
 * `.returning()` — if the user manually set a title in parallel, this call
 * returns null instead of clobbering their value.
 */
export async function maybeGenerateTitle(
  conversation: Conversation,
  userMessage: UserMessage,
  modelId: string,
): Promise<string | null> {
  if (conversation.title) return null;

  const model = createModelProvider(modelId);

  const title = await callModel(model, userMessage);
  if (!title) return null;

  const updated = await db
    .update(conversations)
    .set({ title })
    .where(and(eq(conversations.id, conversation.id), isNull(conversations.title)))
    .returning({ id: conversations.id });
  if (updated.length === 0) return null;

  return title;
}
