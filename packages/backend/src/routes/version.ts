import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/index.js";
import { conversations, fileBlobs, versionFiles, versions } from "../db/schema.js";
import { conflict, notFound, ok, validate } from "../http/index.js";
import { acquireConversationSandbox } from "../services/conversation-sandbox.js";
import { restoreToVersion, syncSandboxToVersion } from "../services/version-service/index.js";

const conversationParam = z.object({ conversationId: z.uuid() });
const versionParam = z.object({ conversationId: z.uuid(), versionId: z.uuid() });

const versionRouter = new Hono();

versionRouter.get("/:conversationId/versions", validate("param", conversationParam), async (c) => {
  const { conversationId } = c.req.valid("param");
  const user = c.get("user");

  const [conv] = await db
    .select({ currentVersionId: conversations.currentVersionId })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
  if (!conv) return notFound(c, "Conversation not found");

  const rows = await db
    .select({
      id: versions.id,
      parentVersionId: versions.parentVersionId,
      createdByMessageId: versions.createdByMessageId,
      label: versions.label,
      fileCount: versions.fileCount,
      totalBytes: versions.totalBytes,
      createdAt: versions.createdAt,
    })
    .from(versions)
    .where(eq(versions.conversationId, conversationId))
    .orderBy(asc(versions.createdAt));

  return ok(
    c,
    rows.map((r) => ({ ...r, isCurrent: r.id === conv.currentVersionId })),
  );
});

versionRouter.get(
  "/:conversationId/versions/:versionId/files",
  validate("param", versionParam),
  async (c) => {
    const { conversationId, versionId } = c.req.valid("param");
    const user = c.get("user");

    const [version] = await db
      .select({ id: versions.id })
      .from(versions)
      .innerJoin(conversations, eq(versions.conversationId, conversations.id))
      .where(
        and(
          eq(versions.id, versionId),
          eq(versions.conversationId, conversationId),
          eq(conversations.userId, user.id),
        ),
      );
    if (!version) return notFound(c, "Version not found");

    const rows = await db
      .select({ path: versionFiles.path, content: fileBlobs.content })
      .from(versionFiles)
      .innerJoin(fileBlobs, eq(versionFiles.blobHash, fileBlobs.hash))
      .where(eq(versionFiles.versionId, versionId));

    return ok(c, rows);
  },
);

versionRouter.post(
  "/:conversationId/versions/:versionId/preview",
  validate("param", versionParam),
  async (c) => {
    const { conversationId, versionId } = c.req.valid("param");
    const user = c.get("user");

    // Single JOIN: ownership + version-belongs-to-conversation in one round-trip.
    const [row] = await db
      .select({
        sandboxId: conversations.sandboxId,
        currentVersionId: conversations.currentVersionId,
        versionId: versions.id,
      })
      .from(conversations)
      .innerJoin(
        versions,
        and(eq(versions.conversationId, conversations.id), eq(versions.id, versionId)),
      )
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
    if (!row) return notFound(c, "Conversation or version not found");

    const { sandbox } = await acquireConversationSandbox(conversationId, row.sandboxId);
    const result = await syncSandboxToVersion({ sandbox, targetVersionId: versionId });

    const nextPreviewing = versionId === row.currentVersionId ? null : versionId;
    await db
      .update(conversations)
      .set({ previewingVersionId: nextPreviewing, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return ok(c, { ...result, previewingVersionId: nextPreviewing });
  },
);

versionRouter.post(
  "/:conversationId/versions/:versionId/restore",
  validate("param", versionParam),
  async (c) => {
    const { conversationId, versionId } = c.req.valid("param");
    const user = c.get("user");

    const [row] = await db
      .select({
        sandboxId: conversations.sandboxId,
        currentVersionId: conversations.currentVersionId,
        agentRunning: conversations.agentRunning,
        versionId: versions.id,
      })
      .from(conversations)
      .innerJoin(
        versions,
        and(eq(versions.conversationId, conversations.id), eq(versions.id, versionId)),
      )
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)));
    if (!row) return notFound(c, "Conversation or version not found");
    if (row.agentRunning) {
      return conflict(c, "Agent is currently running; stop it before restoring");
    }
    if (row.currentVersionId === versionId) {
      return conflict(c, "Already on this version");
    }

    const { sandbox } = await acquireConversationSandbox(conversationId, row.sandboxId);
    const result = await restoreToVersion({
      sandbox,
      conversationId,
      targetVersionId: versionId,
      fromVersionId: row.currentVersionId,
    });

    return ok(c, result);
  },
);

export { versionRouter };
