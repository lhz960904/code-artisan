import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "../db";
import { conversations, fileSnapshots, messages } from "../db/schema";
import { createVersionFromManifest } from "../services/version-service";

interface Stats {
  scanned: number;
  backfilled: number;
  skippedEmpty: number;
  totalFiles: number;
  totalNewBlobs: number;
}

type BackfillResult =
  | { kind: "skipped"; reason: "empty" }
  | { kind: "ok"; versionId: string; fileCount: number; newBlobCount: number };

async function main(): Promise<void> {
  console.log("[backfill-versions] start");

  const targets = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(isNull(conversations.currentVersionId));

  console.log(`[backfill-versions] ${targets.length} conversation(s) need a v0`);

  const stats: Stats = {
    scanned: targets.length,
    backfilled: 0,
    skippedEmpty: 0,
    totalFiles: 0,
    totalNewBlobs: 0,
  };

  for (const { id } of targets) {
    const result = await backfillOne(id);
    if (result.kind === "skipped") {
      stats.skippedEmpty += 1;
      console.log(`  - ${id}: skipped (no file snapshots)`);
      continue;
    }
    stats.backfilled += 1;
    stats.totalFiles += result.fileCount;
    stats.totalNewBlobs += result.newBlobCount;
    console.log(
      `  - ${id}: v0=${result.versionId} files=${result.fileCount} new_blobs=${result.newBlobCount}`,
    );
  }

  console.log("[backfill-versions] done");
  console.log(`  scanned:    ${stats.scanned}`);
  console.log(`  backfilled: ${stats.backfilled}`);
  console.log(`  skipped:    ${stats.skippedEmpty} (empty manifest)`);
  console.log(`  files:      ${stats.totalFiles}`);
  console.log(`  new blobs:  ${stats.totalNewBlobs}`);
  if (stats.totalFiles > 0) {
    const dedupRate = ((stats.totalFiles - stats.totalNewBlobs) / stats.totalFiles) * 100;
    console.log(`  dedup:      ${dedupRate.toFixed(1)}% reused across conversations`);
  }
}

async function backfillOne(conversationId: string): Promise<BackfillResult> {
  const [snapshotRows, firstUserMessage] = await Promise.all([
    db
      .select({ path: fileSnapshots.path, content: fileSnapshots.content })
      .from(fileSnapshots)
      .where(eq(fileSnapshots.conversationId, conversationId)),
    db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")))
      .orderBy(asc(messages.createdAt))
      .limit(1),
  ]);

  if (snapshotRows.length === 0) {
    return { kind: "skipped", reason: "empty" };
  }

  const manifest = new Map<string, string>();
  for (const row of snapshotRows) manifest.set(row.path, row.content);

  const result = await createVersionFromManifest({
    conversationId,
    parentVersionId: null,
    createdByMessageId: firstUserMessage[0]?.id ?? null,
    manifest,
    label: "v0 (backfilled)",
  });

  return {
    kind: "ok",
    versionId: result.versionId,
    fileCount: result.fileCount,
    newBlobCount: result.newBlobCount,
  };
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[backfill-versions] fatal:", err);
      process.exit(1);
    });
}
