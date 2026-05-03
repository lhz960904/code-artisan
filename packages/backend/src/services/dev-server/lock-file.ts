import { z } from "zod";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";
import { MANIFEST_DIR } from "./manifest";

export const LOCK_FILE_PATH = `${MANIFEST_DIR}/dev.lock`;

const lockFileSchema = z.object({
  port: z.number().int().positive().max(65535),
  sessionId: z.string().min(1),
  command: z.string().min(1),
  ts: z.number().int().nonnegative(),
});

export type LockFile = z.infer<typeof lockFileSchema>;

export async function readLockFile(sandbox: E2BSandbox): Promise<LockFile | null> {
  let raw: string;
  try {
    raw = await sandbox.readFile(LOCK_FILE_PATH);
  } catch {
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    console.warn(`[dev-lock] JSON parse failed for ${LOCK_FILE_PATH}:`, err);
    return null;
  }

  const result = lockFileSchema.safeParse(json);
  if (!result.success) {
    console.warn(`[dev-lock] schema validation failed:`, result.error.issues);
    return null;
  }
  return result.data;
}

export async function writeLockFile(sandbox: E2BSandbox, lock: LockFile): Promise<void> {
  try {
    await sandbox.sdk.files.makeDir(MANIFEST_DIR);
  } catch (err) {
    console.warn(`[dev-lock] makeDir ${MANIFEST_DIR} failed:`, err);
  }
  await sandbox.writeFile(LOCK_FILE_PATH, JSON.stringify(lock, null, 2));
}

export async function clearLockFile(sandbox: E2BSandbox): Promise<void> {
  try {
    await sandbox.sdk.files.remove(LOCK_FILE_PATH);
  } catch {
    // already gone — that's the desired end state
  }
}
