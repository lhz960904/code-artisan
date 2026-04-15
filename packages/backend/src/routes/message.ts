import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Attachment } from "@code-artisan/shared";

import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { MessageStore } from "../services/message-store.js";
import { buildUserMessage, runConversation, stopRunner } from "../runner/index.js";
import { ok, notFound, validate } from "../http/index.js";

const MAX_ATTACHMENTS = 5;
const HEARTBEAT_MS = 15_000;

const conversationParamSchema = z.object({
  conversationId: z.uuid(),
});

const sendMessageSchema = z
  .object({
    content: z.string().default(""),
    attachments: z.array(z.custom<Attachment>()).max(MAX_ATTACHMENTS).optional(),
  })
  .refine((d) => d.content.trim().length > 0 || (d.attachments?.length ?? 0) > 0, {
    message: "Message content or attachments required",
  });

const messageRouter = new Hono();

// Get messages for a conversation
messageRouter.get(
  "/:conversationId",
  validate("param", conversationParamSchema),
  async (c) => {
    const { conversationId } = c.req.valid("param");
    const store = new MessageStore(conversationId);
    const messages = await store.getMessages();
    return ok(c, messages);
  },
);

// Send a user message and stream the agent run back as SSE
messageRouter.post(
  "/:conversationId",
  validate("param", conversationParamSchema),
  validate("json", sendMessageSchema),
  async (c) => {
    const { conversationId } = c.req.valid("param");
    const { content, attachments } = c.req.valid("json");

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (!conversation) return notFound(c, "Conversation not found");

    const userMessage = await buildUserMessage(content, attachments ?? []);
    const store = new MessageStore(conversationId);
    const { id: newUserMessageId } = await store.addMessage(userMessage);

    return streamSSE(c, async (stream) => {
      // Abort the runner if the client disconnects.
      stream.onAbort(() => {
        stopRunner(conversationId);
      });

      const heartbeat = setInterval(async () => {
        try {
          await stream.writeSSE({ data: "" });
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_MS);

      try {
        for await (const event of runConversation({ conversationId, newUserMessageId })) {
          await stream.writeSSE({ data: JSON.stringify(event) });
          if (event.type === "done") break;
        }
      } finally {
        clearInterval(heartbeat);
      }
    });
  },
);

// Stop a running agent
messageRouter.post(
  "/:conversationId/stop",
  validate("param", conversationParamSchema),
  async (c) => {
    const { conversationId } = c.req.valid("param");
    const stopped = stopRunner(conversationId);
    if (stopped) {
      await db
        .update(conversations)
        .set({ agentRunning: false })
        .where(eq(conversations.id, conversationId));
    }
    return ok(c, { stopped });
  },
);

export { messageRouter };
