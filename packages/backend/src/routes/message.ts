import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Attachment } from "@code-artisan/shared";

import { db } from "../db/index.js";
import { conversations, messages } from "../db/schema.js";
import { ok, notFound, validate } from "../http/index.js";
import { AgentTurnService } from "../services/agent-turn.js";
import { buildUserMessage } from "../utils/message.js";

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
messageRouter.get("/:conversationId", validate("param", conversationParamSchema), async (c) => {
  const { conversationId } = c.req.valid("param");
  const user = c.get("user");
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
  if (!conversation) return notFound(c, "Conversation not found");
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
  return ok(c, rows);
});

// Send a user message and stream the agent run back as SSE
messageRouter.post(
  "/:conversationId",
  validate("param", conversationParamSchema),
  validate("json", sendMessageSchema),
  async (c) => {
    const { conversationId } = c.req.valid("param");
    const { content, attachments } = c.req.valid("json");
    const user = c.get("user");
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
    if (!conversation) {
      return notFound(c, "Conversation not found");
    }
    const turnService = new AgentTurnService(conversation);
    const userMessage = await buildUserMessage(content, attachments ?? []);
    return streamSSE(c, async (stream) => {
      const interval = setInterval(async () => {
        await stream.writeSSE({ data: "" });
      }, HEARTBEAT_MS);

      try {
        for await (const event of turnService.run(userMessage)) {
          await stream.writeSSE({ data: JSON.stringify(event) });
        }
      } finally {
        clearInterval(interval);
      }
    });
  },
);

// Stop a running agent
// messageRouter.post("/:conversationId/stop", validate("param", conversationParamSchema), async (c) => {
//   const { conversationId } = c.req.valid("param");
//   const stopped = stopRunner(conversationId);
//   if (stopped) {
//     await db.update(conversations).set({ agentRunning: false }).where(eq(conversations.id, conversationId));
//   }
//   return ok(c, { stopped });
// });

export { messageRouter };
