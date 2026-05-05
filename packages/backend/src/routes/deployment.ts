import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { conversations, deployments } from "../db/schema.js";
import { badRequest, conflict, created, notFound, ok, serverError, validate } from "../http/index.js";
import {
  VercelNotConnectedError,
  VercelTokenInvalidError,
} from "../services/integration/vercel-client.js";
import { deployConversation } from "../services/deploy-service/index.js";

const conversationParam = z.object({ conversationId: z.uuid() });

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

    try {
      const row = await deployConversation({ conversationId, userId: user.id });
      if (row.status === "failed") {
        return serverError(c, row.errorMessage ?? "Deploy failed");
      }
      return created(c, row);
    } catch (err) {
      if (err instanceof VercelNotConnectedError) {
        return badRequest(c, "Connect your Vercel account in Settings → Integrations first.");
      }
      if (err instanceof VercelTokenInvalidError) {
        return conflict(c, "Vercel token is invalid. Please reconnect.");
      }
      throw err;
    }
  },
);

export { deploymentRouter };
