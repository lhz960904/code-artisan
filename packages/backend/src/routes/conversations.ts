import { Hono } from "hono";
import { db } from "../db/index.js";
import { conversations, events } from "../db/schema.js";
import { eq, desc, gt, and } from "drizzle-orm";
import { AgentService } from "../services/agent.js";

const conversationsRouter = new Hono();

// Create conversation
conversationsRouter.post("/", async (c) => {
  const { title } = await c.req.json<{ title?: string }>();

  const [conv] = await db
    .insert(conversations)
    .values({
      userId: "00000000-0000-0000-0000-000000000000", // Phase 2: no auth, placeholder
      title: title || null,
    })
    .returning();

  return c.json(conv, 201);
});

// List conversations
conversationsRouter.get("/", async (c) => {
  const result = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));

  return c.json(result);
});

// Get conversation detail
conversationsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Not found" }, 404);
  return c.json(conv);
});

// Update conversation (title, mode)
conversationsRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const updates = await c.req.json<{ title?: string; mode?: string }>();

  const [conv] = await db
    .update(conversations)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();

  if (!conv) return c.json({ error: "Not found" }, 404);
  return c.json(conv);
});

// Get events for conversation (with optional afterSeq for catchup)
conversationsRouter.get("/:id/events", async (c) => {
  const id = c.req.param("id");
  const afterSeq = c.req.query("afterSeq");

  const conditions = [eq(events.conversationId, id)];
  if (afterSeq) {
    conditions.push(gt(events.seq, Number(afterSeq)));
  }

  const result = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(events.seq);

  return c.json(result);
});

// Send message — fire-and-forget, agent runs in background
conversationsRouter.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const { content } = await c.req.json<{ content: string }>();

  if (!content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  // Verify conversation exists
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  // Fire-and-forget: start agent loop in background
  const agent = new AgentService();
  agent.run({ conversationId: id, userMessage: content }).catch((err) => {
    console.error(`Agent error for conversation ${id}:`, err);
  });

  // Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id));

  return c.json({ status: "started" });
});

export { conversationsRouter };
