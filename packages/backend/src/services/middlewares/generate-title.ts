import Anthropic from "@anthropic-ai/sdk";
import type { AgentMiddleware } from "@code-artisan/agent";
import type { UserMessage } from "@code-artisan/shared";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../db";
import { conversations } from "../../db/schema";

type Conversation = typeof conversations.$inferSelect;

const TITLE_MODEL = "minimax-m2.5";
const TITLE_MAX_TOKENS = 40;
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

async function generateTitle(userMessage: UserMessage): Promise<string | null> {
  const text = extractUserText(userMessage);
  if (!text) return null;

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });

  try {
    const res = await client.messages.create({
      model: TITLE_MODEL,
      max_tokens: TITLE_MAX_TOKENS,
      messages: [{ role: "user", content: `${TITLE_PROMPT}\n\n${text}` }],
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
    console.error("[generateTitleMiddleware] LLM call failed:", err);
    return null;
  }
}

export interface GenerateTitleMiddlewareOptions {
  conversation: Conversation;
  /** Called with the generated title after DB has been updated successfully. */
  onTitleReady: (title: string) => void;
}

/**
 * Agent-run middleware: before the agent starts, block briefly to generate
 * a concise conversation title from the first user message, persist it, and
 * emit a `title_update` via `onTitleReady`. Runs at most once per
 * conversation (skipped if `conversation.title` is already set) so the extra
 * latency is a one-time cost on the first message.
 *
 * Concurrency safety: the DB update guards with `title IS NULL` and
 * `.returning()` — if the user manually set a title in parallel, we skip
 * the event emission instead of clobbering their value.
 */
export function generateTitleMiddleware(
  opts: GenerateTitleMiddlewareOptions,
): AgentMiddleware {
  return {
    beforeAgentRun: async ({ agentContext }) => {
      if (opts.conversation.title) return;
      const userMessage = [...agentContext.messages]
        .reverse()
        .find((m) => m.role === "user") as UserMessage | undefined;
      if (!userMessage) return;

      const title = await generateTitle(userMessage);
      if (!title) return;

      const updated = await db
        .update(conversations)
        .set({ title })
        .where(and(eq(conversations.id, opts.conversation.id), isNull(conversations.title)))
        .returning({ id: conversations.id });
      if (updated.length === 0) return;

      opts.onTitleReady(title);
    },
  };
}
