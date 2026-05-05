import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { conversations, deployments } from "../db/schema.js";
import { notFound, ok, validate } from "../http/index.js";
import { deployConversation } from "../services/deploy-service/index.js";

const conversationParam = z.object({ conversationId: z.uuid() });
const HEARTBEAT_MS = 15_000;

const deploymentRouter = new Hono();

deploymentRouter.get(
  "/:conversationId",
  validate("param", conversationParam),
  async (c) => {
    const { conversationId } = c.req.valid("param");
    const user = c.get("user");

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
    if (!conv) return notFound(c, "Conversation not found");

    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.conversationId, conversationId))
      .orderBy(desc(deployments.createdAt));

    return ok(c, rows);
  },
);

deploymentRouter.post(
  "/:conversationId",
  validate("param", conversationParam),
  async (c) => {
    const { conversationId } = c.req.valid("param");
    const user = c.get("user");

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
    if (!conv) return notFound(c, "Conversation not found");

    return streamSSE(c, async (stream) => {
      const heartbeat = setInterval(async () => {
        await stream.writeSSE({ data: "" });
      }, HEARTBEAT_MS);

      try {
        for await (const event of deployConversation({ conversationId, userId: user.id })) {
          await stream.writeSSE({ data: JSON.stringify(event) });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", code: "generic", message }),
        });
      } finally {
        clearInterval(heartbeat);
      }
    });
  },
);

export { deploymentRouter };
