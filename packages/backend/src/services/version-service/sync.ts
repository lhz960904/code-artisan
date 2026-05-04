import { eq } from "drizzle-orm";

import { SANDBOX_IGNORED_DIRS, SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import { db } from "../../db";
import { fileBlobs, versionFiles } from "../../db/schema";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";

export interface SyncResult {
  syncedFiles: number;
  deletedFiles: number;
  // Target manifest already loaded for the sync — exposed so callers like
  // restore can mirror it into fileSnapshots cache without a duplicate query.
  manifest: Array<{ path: string; content: string }>;
}

const IGNORE_FIND_ARGS = [
  ...SANDBOX_IGNORED_DIRS.map((dir) => `-not -path './${dir}/*' -not -path './*/${dir}/*'`),
  "-not -name '*.log'",
].join(" ");

export async function syncSandboxToVersion(args: {
  sandbox: E2BSandbox;
  targetVersionId: string;
}): Promise<SyncResult> {
  const { sandbox, targetVersionId } = args;

  const [targetEntries, currentAbsPaths] = await Promise.all([
    loadVersionManifest(targetVersionId),
    listSandboxAbsPaths(sandbox),
  ]);

  const targetPathSet = new Set(targetEntries.map((e) => e.path));
  const toDelete = [...currentAbsPaths].filter((p) => !targetPathSet.has(p));

  await Promise.all([
    targetEntries.length > 0
      ? sandbox.sdk.files.write(targetEntries.map((e) => ({ path: e.path, data: e.content })))
      : Promise.resolve(),
    batchRemove(sandbox, toDelete),
  ]);

  return {
    syncedFiles: targetEntries.length,
    deletedFiles: toDelete.length,
    manifest: targetEntries,
  };
}

async function loadVersionManifest(versionId: string): Promise<Array<{ path: string; content: string }>> {
  return db
    .select({ path: versionFiles.path, content: fileBlobs.content })
    .from(versionFiles)
    .innerJoin(fileBlobs, eq(versionFiles.blobHash, fileBlobs.hash))
    .where(eq(versionFiles.versionId, versionId));
}

// One RTT instead of N — E2B has no batch delete API, so shell out to `rm -f`.
// Single-quote each path and escape embedded quotes; -f swallows missing files.
async function batchRemove(sandbox: E2BSandbox, absPaths: string[]): Promise<void> {
  if (absPaths.length === 0) return;
  const args = absPaths.map((p) => `'${p.replace(/'/g, `'\\''`)}'`).join(" ");
  const res = await sandbox.exec(`rm -f ${args}`);
  if (res.exitCode !== 0) {
    console.error(`[sync] batch remove non-zero exit (${res.exitCode}):`, res.stderr);
  }
}

// Sandbox-side scan via `find` — authoritative current state, immune to drift
// caused by previous preview switches or out-of-band edits.
async function listSandboxAbsPaths(sandbox: E2BSandbox): Promise<Set<string>> {
  const cmd = `find . -type f ${IGNORE_FIND_ARGS}`;
  const res = await sandbox.exec(cmd, { cwd: SANDBOX_WORKSPACE_ROOT });
  if (res.exitCode !== 0) {
    throw new Error(`sandbox path scan failed: ${res.stderr}`);
  }
  const out = new Set<string>();
  for (const line of res.stdout.split("\n")) {
    if (!line) continue;
    const rel = line.startsWith("./") ? line.slice(2) : line;
    out.add(`${SANDBOX_WORKSPACE_ROOT}/${rel}`);
  }
  return out;
}
