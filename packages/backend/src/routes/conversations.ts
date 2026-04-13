import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eq, desc } from "drizzle-orm";
import type { Attachment, AgentSseEvent } from "@code-artisan/shared";

import { db } from "../db/index.js";
import { conversations, messages, fileSnapshots } from "../db/schema.js";
import { eventBus } from "../services/event-bus.js";
import { MessageStore } from "../services/message-store.js";
import { buildUserMessage, runConversation, stopRunner } from "../runner/index.js";

const conversationsRouter = new Hono();

// Create conversation
conversationsRouter.post("/", async (c) => {
  const { title } = await c.req.json<{ title?: string }>();
  const [conv] = await db
    .insert(conversations)
    .values({
      userId: "00000000-0000-0000-0000-000000000000",
      title: title ?? null,
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

// Update conversation (title)
conversationsRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const updates = await c.req.json<{ title?: string }>();
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

// Get messages
conversationsRouter.get("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const store = new MessageStore(id);
  const result = await store.getMessages();
  return c.json(result);
});

// Get file snapshots
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

// SSE stream — real-time events for a running conversation
conversationsRouter.get("/:id/stream", async (c) => {
  const id = c.req.param("id");
  const [conv] = await db
    .select({ agentRunning: conversations.agentRunning })
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv?.agentRunning) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: "done" } satisfies AgentSseEvent) });
    });
  }

  return streamSSE(c, async (stream) => {
    const unsub = eventBus.subscribe(id, async (event) => {
      try {
        await stream.writeSSE({ data: JSON.stringify(event) });
      } catch {
        // client disconnected
      }
    });
    stream.onAbort(() => unsub());

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

// Send a user message — persists it then kicks off a run.
conversationsRouter.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const { content, attachments } = await c.req.json<{
    content: string;
    attachments?: Attachment[];
  }>();

  if (!content?.trim() && (!attachments || attachments.length === 0)) {
    return c.json({ error: "Message content or attachments required" }, 400);
  }
  if (attachments && attachments.length > 5) {
    return c.json({ error: "Maximum 5 attachments per message" }, 400);
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  // Build and persist the user message (resolves attachments to agent
  // content shape — images to public URLs, text-like docs inlined).
  const userMessage = await buildUserMessage(content ?? "", attachments ?? []);
  const store = new MessageStore(id);
  const { id: newUserMessageId } = await store.addMessage(userMessage);

  // Fire the runner; it flips agentRunning and emits SSE events.
  void runConversation({ conversationId: id, newUserMessageId }).catch((err) => {
    console.error(`[conversations] runConversation error:`, err);
  });

  return c.json({ status: "started" });
});

// Stop a running agent
conversationsRouter.post("/:id/stop", async (c) => {
  const id = c.req.param("id");
  const stopped = stopRunner(id);
  if (stopped) {
    await db
      .update(conversations)
      .set({ agentRunning: false })
      .where(eq(conversations.id, id));
  }
  return c.json({ status: stopped ? "stopped" : "not_running" });
});

export { conversationsRouter };
