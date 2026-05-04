import { eq } from "drizzle-orm";

import { db } from "../../db";
import { conversations, fileSnapshots, messages } from "../../db/schema";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";
import { syncSandboxToVersion } from "./sync";

export interface RestoreArgs {
  sandbox: E2BSandbox;
  conversationId: string;
  targetVersionId: string;
  fromVersionId: string | null;
}

export interface RestoreResult {
  restoreMessageId: string;
  currentVersionId: string;
  fromVersionId: string | null;
  revertedFileCount: number;
}

export async function restoreToVersion(args: RestoreArgs): Promise<RestoreResult> {
  const syncResult = await syncSandboxToVersion({
    sandbox: args.sandbox,
    targetVersionId: args.targetVersionId,
  });

  // Reuse manifest already fetched inside sync — saves one round-trip to DB.
  const manifestRows = syncResult.manifest;

  return await db.transaction(async (tx) => {
    await tx
      .update(conversations)
      .set({
        currentVersionId: args.targetVersionId,
        previewingVersionId: null,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, args.conversationId));

    const [restoreMessage] = await tx
      .insert(messages)
      .values({
        conversationId: args.conversationId,
        role: "system",
        content: [{ type: "text", text: "Restored" }],
        metadata: {
          type: "restore_checkpoint",
          restoredToVersionId: args.targetVersionId,
          fromVersionId: args.fromVersionId,
          revertedFileCount: manifestRows.length,
        },
      })
      .returning({ id: messages.id });

    // Rewrite fileSnapshots cache to mirror target — required so any future
    // sandbox cold-start in acquireConversationSandbox restores the correct state.
    await tx.delete(fileSnapshots).where(eq(fileSnapshots.conversationId, args.conversationId));
    if (manifestRows.length > 0) {
      await tx.insert(fileSnapshots).values(
        manifestRows.map((row) => ({
          conversationId: args.conversationId,
          path: row.path,
          content: row.content,
        })),
      );
    }

    return {
      restoreMessageId: restoreMessage.id,
      currentVersionId: args.targetVersionId,
      fromVersionId: args.fromVersionId,
      revertedFileCount: manifestRows.length,
    };
  });
}

// Walk parent_version_id from current to root; current first → root last.
// Used by AI context filter to decide which conversation turns are still alive.
export function computeActiveChain(
  allVersions: Array<{ id: string; parentVersionId: string | null }>,
  currentVersionId: string | null,
): string[] {
  if (!currentVersionId) return [];
  const byId = new Map(allVersions.map((v) => [v.id, v]));
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur = byId.get(currentVersionId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur.id);
    cur = cur.parentVersionId ? byId.get(cur.parentVersionId) : undefined;
  }
  return chain;
}
