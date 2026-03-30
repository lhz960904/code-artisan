import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db/index.js";
import { conversations, events, fileSnapshots } from "../db/schema.js";
import { eq, desc, gt, and } from "drizzle-orm";
import { createAgent } from "../agent/index.js";
import { eventBus } from "../services/event-bus.js";

const conversationsRouter = new Hono();

// Create conversation
conversationsRouter.post("/", async (c) => {
  const { title } = await c.req.json<{ title?: string }>();

  const [conv] = await db
    .insert(conversations)
    .values({
      userId: "00000000-0000-0000-0000-000000000000",
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

// Delete conversation
conversationsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Delete events and file snapshots first (FK constraint)
  await db.delete(events).where(eq(events.conversationId, id));
  await db.delete(fileSnapshots).where(eq(fileSnapshots.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return c.json({ status: "deleted" });
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

// Get file snapshots for conversation (for editor initial load)
conversationsRouter.get("/:id/files", async (c) => {
  const id = c.req.param("id");

  const result = await db
    .select({
      path: fileSnapshots.path,
      content: fileSnapshots.content,
      updatedAt: fileSnapshots.updatedAt,
    })
    .from(fileSnapshots)
    .where(eq(fileSnapshots.conversationId, id));

  return c.json(result);
});

// SSE stream — real-time events for a conversation
conversationsRouter.get("/:id/stream", (c) => {
  const id = c.req.param("id");

  return streamSSE(c, async (stream) => {
    const unsub = eventBus.subscribe(id, async (event) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
          id: event.id,
        });
      } catch {
        // Client disconnected
      }
    });

    stream.onAbort(() => {
      unsub();
    });

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: "", event: "heartbeat", id: "hb" });
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat);
        resolve();
      });
    });
  });
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
  // Title generation is handled by TitleGenerationMiddleware
  const agent = createAgent();
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

// User approves/rejects a confirm_required event
conversationsRouter.post("/:id/confirm", async (c) => {
  const id = c.req.param("id");
  const { approved } = await c.req.json<{ approved: boolean }>();

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  await db.insert(events).values({
    conversationId: id,
    type: "confirm_response",
    data: { approved },
  });

  // Re-invoke agent to continue (fire-and-forget, no new userMessage)
  const agent = createAgent();
  agent.run({ conversationId: id }).catch((err) => {
    console.error(`Agent error after confirm for conversation ${id}:`, err);
  });

  return c.json({ status: "ok" });
});

export { conversationsRouter };
