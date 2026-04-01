import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db/index.js";
import { conversations, messages, fileSnapshots } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { createAgent } from "../agent/index.js";
import { eventBus } from "../services/event-bus.js";
import { MessageStore } from "../services/message-store.js";

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

  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(fileSnapshots).where(eq(fileSnapshots.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return c.json({ status: "deleted" });
});

// Get messages for conversation
conversationsRouter.get("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const store = new MessageStore(id);
  const result = await store.getMessages();
  return c.json(result);
});

// Get file snapshots for conversation
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

// SSE stream — real-time stream for a conversation
conversationsRouter.get("/:id/stream", async (c) => {
  const id = c.req.param("id");

  // Check if agent is running; if not, return done immediately
  const [conv] = await db
    .select({ agentRunning: conversations.agentRunning })
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv?.agentRunning) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: "done" }) });
    });
  }

  return streamSSE(c, async (stream) => {
    const unsub = eventBus.subscribe(id, async (data) => {
      try {
        await stream.writeSSE({ data: JSON.stringify(data) });
      } catch {
        // Client disconnected
      }
    });

    stream.onAbort(() => {
      unsub();
    });

    // Heartbeat every 15s
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: "" });
      } catch {
        clearInterval(heartbeat);
      }
    }, 15_000);

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat);
        resolve();
      });
    });
  });
});

// Send message
conversationsRouter.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const { content } = await c.req.json<{ content: string }>();

  if (!content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const agent = createAgent();

  await db
    .update(conversations)
    .set({ agentRunning: true, updatedAt: new Date() })
    .where(eq(conversations.id, id));

  agent.run({ conversationId: id, userMessage: content })
    .catch((err) => {
      console.error(`Agent error for conversation ${id}:`, err);
    })
    .finally(() => {
      db.update(conversations)
        .set({ agentRunning: false })
        .where(eq(conversations.id, id))
        .catch(() => {});
    });

  return c.json({ status: "started" });
});

// Confirm tool execution
conversationsRouter.post("/:id/confirm", async (c) => {
  const id = c.req.param("id");
  const { approved } = await c.req.json<{ approved: boolean }>();

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  // Store confirm response as a user message with metadata
  const store = new MessageStore(id);
  await store.addMessage("user", [{ type: "text", text: approved ? "Approved" : "Rejected" }], {
    confirmResponse: { approved },
  });

  // Re-invoke agent to continue
  const agent = createAgent();

  await db
    .update(conversations)
    .set({ agentRunning: true })
    .where(eq(conversations.id, id));

  agent.run({ conversationId: id })
    .catch((err) => {
      console.error(`Agent error after confirm for conversation ${id}:`, err);
    })
    .finally(() => {
      db.update(conversations)
        .set({ agentRunning: false })
        .where(eq(conversations.id, id))
        .catch(() => {});
    });

  return c.json({ status: "ok" });
});

export { conversationsRouter };
