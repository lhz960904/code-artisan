import { Hono } from "hono";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations, messages, fileSnapshots } from "../db/schema.js";
import { ok, created, notFound, validate } from "../http/index.js";

const conversationRouter = new Hono();

// Create conversation
conversationRouter.post(
  "/",
  validate("json", z.object({ title: z.string().optional() })),
  async (c) => {
    const { title } = c.req.valid("json");
    const [conversation] = await db
      .insert(conversations)
      .values({
        userId: "00000000-0000-0000-0000-000000000000",
        title: title ?? null,
      })
      .returning();
    return created(c, conversation);
  },
);

// List conversations
conversationRouter.get("/", async (c) => {
  const result = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  return ok(c, result);
});

// Get conversation detail
conversationRouter.get(
  "/:id",
  validate("param", z.object({ id: z.uuid() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conversation) return notFound(c, "Conversation not found");
    return ok(c, conversation);
  },
);

// Update conversation (title)
conversationRouter.patch(
  "/:id",
  validate("param", z.object({ id: z.uuid() })),
  validate("json", z.object({ title: z.string().optional() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const updates = c.req.valid("json");
    const [conversation] = await db
      .update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    if (!conversation) return notFound(c, "Conversation not found");
    return ok(c, conversation);
  },
);

// Delete conversation (cascades messages and snapshots)
conversationRouter.delete(
  "/:id",
  validate("param", z.object({ id: z.uuid() })),
  async (c) => {
    const { id } = c.req.valid("param");
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(fileSnapshots).where(eq(fileSnapshots.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    return ok(c, { deleted: true });
  },
);

export { conversationRouter };
