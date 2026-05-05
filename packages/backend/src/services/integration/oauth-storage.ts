import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { settings } from "../../db/schema.js";
import { decryptString, encryptString, isEncryptedBlob } from "./crypto.js";

export const SETTINGS_KEY_VERCEL_OAUTH = "vercel_oauth" as const;
export const SETTINGS_KEY_SUPABASE_OAUTH = "supabase_oauth" as const;

export async function readEncryptedSetting<T>(userId: string, key: string): Promise<T | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)));
  if (!row || !isEncryptedBlob(row.value)) return null;
  try {
    return JSON.parse(await decryptString(row.value)) as T;
  } catch {
    return null;
  }
}

export async function writeEncryptedSetting<T>(
  userId: string,
  key: string,
  value: T,
): Promise<void> {
  const blob = await encryptString(JSON.stringify(value));
  await db
    .insert(settings)
    .values({ userId, key, value: blob })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value: blob, updatedAt: new Date() },
    });
}

export async function deleteEncryptedSetting(userId: string, key: string): Promise<void> {
  await db.delete(settings).where(and(eq(settings.userId, userId), eq(settings.key, key)));
}
