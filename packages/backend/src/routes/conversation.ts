import { Hono } from "hono";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations, messages, fileSnapshots } from "../db/schema.js";
import { ok, created, notFound, validate } from "../http/index.js";

const conversationRouter = new Hono();

// Create conversation
conversationRouter.post("/", validate("json", z.object({ title: z.string().optional() })), async (c) => {
  const { title } = c.req.valid("json");
  const user = c.get("user");
  const [conversation] = await db
    .insert(conversations)
    .values({ userId: user.id, title: title ?? null })
    .returning();
  return created(c, conversation);
});

// List conversations
conversationRouter.get("/", async (c) => {
  const user = c.get("user");
  const result = await db.select().from(conversations).where(eq(conversations.userId, user.id)).orderBy(desc(conversations.updatedAt));
  return ok(c, result);
});

// Get conversation detail
conversationRouter.get("/:id", validate("param", z.object({ id: z.uuid() })), async (c) => {
  const { id } = c.req.valid("param");
  const user = c.get("user");
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)));
  if (!conversation) return notFound(c, "Conversation not found");
  return ok(c, conversation);
});

// Update conversation
conversationRouter.patch(
  "/:id",
  validate("param", z.object({ id: z.uuid() })),
  validate("json", z.object({ title: z.string().optional() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const updates = c.req.valid("json");
    const user = c.get("user");
    const [conversation] = await db
      .update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)))
      .returning();
    if (!conversation) return notFound(c, "Conversation not found");
    return ok(c, conversation);
  },
);

// Delete conversation (cascades messages and snapshots)
conversationRouter.delete("/:id", validate("param", z.object({ id: z.uuid() })), async (c) => {
  const { id } = c.req.valid("param");
  const user = c.get("user");
  const [owned] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)));
  if (!owned) return notFound(c, "Conversation not found");
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(fileSnapshots).where(eq(fileSnapshots.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));
  return ok(c, { deleted: true });
});

export { conversationRouter };
