import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/index.js";
import { conversations, messages, fileSnapshots } from "../db/schema.js";
import { notFound, ok, validate } from "../http/index.js";

const publicRouter = new Hono();

// GET /api/public/conversations/:slug — read-only share endpoint.
// Returns a safe DTO: no userId / sandbox / integration tokens / refs.
publicRouter.get(
  "/conversations/:slug",
  validate("param", z.object({ slug: z.string().min(1).max(64) })),
  async (c) => {
    const { slug } = c.req.valid("param");

    const [conversation] = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        deployUrl: conversations.deployUrl,
        sharedAt: conversations.sharedAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.shareSlug, slug));

    if (!conversation || !conversation.deployUrl) return notFound(c, "Share not found");

    const [messageRows, fileRows] = await Promise.all([
      db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(asc(messages.createdAt)),
      db
        .select({
          path: fileSnapshots.path,
          content: fileSnapshots.content,
          updatedAt: fileSnapshots.updatedAt,
        })
        .from(fileSnapshots)
        .where(eq(fileSnapshots.conversationId, conversation.id)),
    ]);

    return ok(c, { conversation, messages: messageRows, files: fileRows });
  },
);

export { publicRouter };
