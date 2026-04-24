import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Attachment, WebAgentEvent } from "@code-artisan/shared";
import { SUPPORTED_MODELS } from "@code-artisan/shared";

import { db } from "../db/index.js";
import { conversations, messages } from "../db/schema.js";
import { ok, notFound, validate } from "../http/index.js";
import { AgentTurnService } from "../services/agent-turn.js";
import { agentRunnerRegistry } from "../services/agent-runner-registry.js";
import { maybeGenerateTitle } from "../services/generate-title.js";
import { buildUserMessage } from "../utils/message.js";

const MAX_ATTACHMENTS = 5;
const HEARTBEAT_MS = 15_000;

const conversationParamSchema = z.object({
  conversationId: z.uuid(),
});

const SUPPORTED_MODEL_IDS = SUPPORTED_MODELS.map((m) => m.id) as [string, ...string[]];

const sendMessageSchema = z
  .object({
    content: z.string().default(""),
    attachments: z.array(z.custom<Attachment>()).max(MAX_ATTACHMENTS).optional(),
    model: z.enum(SUPPORTED_MODEL_IDS),
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
    const { content, attachments, model } = c.req.valid("json");
    const user = c.get("user");

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
    if (!conversation) {
      return notFound(c, "Conversation not found");
    }
    const turnService = new AgentTurnService(conversation, { model });
    const userMessage = buildUserMessage(content, attachments ?? []);
    return streamSSE(c, async (stream) => {
      const interval = setInterval(async () => {
        await stream.writeSSE({ data: "" });
      }, HEARTBEAT_MS);

      const titlePromise = maybeGenerateTitle(conversation, userMessage, model).catch((err) => {
        console.error("[message.stream] title generation failed:", err);
        return null;
      });

      try {
        for await (const event of turnService.run(userMessage)) {
          await stream.writeSSE({ data: JSON.stringify(event) });
        }
        // Wait for the title LLM call to finish, then emit it. Title is
        // guaranteed for this stream — internal errors already resolve to null.
        const title = await titlePromise;
        if (title) {
          await stream.writeSSE({
            data: JSON.stringify({ type: "title_update", title } satisfies WebAgentEvent),
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[message.stream] agent turn failed:", err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", message }),
        });
      } finally {
        clearInterval(interval);
      }
    });
  },
);

// Stop a running agent for this conversation. No ownership check: the
// registry only contains conversationIds whose POST /message turn passed
// ownership at start, so unknown ids naturally no-op with { stopped: false }.
messageRouter.post(
  "/:conversationId/stop",
  validate("param", conversationParamSchema),
  async (c) => {
    const { conversationId } = c.req.valid("param");
    const stopped = agentRunnerRegistry.stop(conversationId);
    return ok(c, { stopped });
  },
);

export { messageRouter };
