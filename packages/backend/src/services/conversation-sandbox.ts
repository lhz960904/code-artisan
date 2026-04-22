import { eq } from "drizzle-orm";
import { db } from "../db";
import { conversations, fileSnapshots } from "../db/schema";
import { getSandboxPool } from "../sandbox";
import type { E2BSandbox } from "../sandbox/e2b-sandbox";

export interface ConversationSandboxResult {
  sandbox: E2BSandbox;
  /** Snapshot rows (path + content) loaded from DB, whether or not they were
   *  just written into the sandbox. Consumers (e.g. fileTracker) can use this
   *  to seed their baseline manifest. */
  snapshots: { path: string; content: string }[];
}

/** Acquire an E2B sandbox for the given conversation, making sure it has the
 *  conversation's file snapshots restored on disk.
 *
 *  Path matrix:
 *  - `pool.acquire(sandboxId)` reconnects to the same live sandbox → files
 *    already present, no restore needed.
 *  - `pool.acquire(sandboxId)` falls back to creating a fresh one (expired /
 *    evicted) → we bulk-write all snapshots before returning.
 *  - No `sandboxId` → brand-new conversation, fresh sandbox, nothing to
 *    restore (snapshots is empty anyway).
 *
 *  On a new sandbox id, we also persist it back to `conversations.sandboxId`. */
export async function acquireConversationSandbox(
  conversationId: string,
  currentSandboxId: string | null | undefined,
): Promise<ConversationSandboxResult> {
  const pool = getSandboxPool();
  const [sandbox, snapshots] = await Promise.all([
    pool.acquire(currentSandboxId ?? undefined),
    db
      .select({ path: fileSnapshots.path, content: fileSnapshots.content })
      .from(fileSnapshots)
      .where(eq(fileSnapshots.conversationId, conversationId)),
  ]);

  if (sandbox.sandboxId !== currentSandboxId) {
    if (snapshots.length > 0) {
      try {
        await sandbox.sdk.files.write(snapshots.map((s) => ({ path: s.path, data: s.content })));
      } catch (err) {
        console.error(`[conversation-sandbox] batch snapshot restore failed:`, err);
      }
    }
    await db
      .update(conversations)
      .set({ sandboxId: sandbox.sandboxId })
      .where(eq(conversations.id, conversationId));
  }

  return { sandbox, snapshots };
}
