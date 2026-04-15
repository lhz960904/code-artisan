import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { fileSnapshots } from "../db/schema.js";
import { ok, validate } from "../http/index.js";

const snapshotRouter = new Hono();

// Get file snapshots for a conversation
snapshotRouter.get(
  "/:conversationId",
  validate("param", z.object({ conversationId: z.uuid() })),
  async (c) => {
    const { conversationId } = c.req.valid("param");
    const snapshots = await db
      .select({
        path: fileSnapshots.path,
        content: fileSnapshots.content,
        updatedAt: fileSnapshots.updatedAt,
      })
      .from(fileSnapshots)
      .where(eq(fileSnapshots.conversationId, conversationId));
    return ok(c, snapshots);
  },
);

export { snapshotRouter };
