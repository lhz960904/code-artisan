import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { settings } from "../db/schema.js";
import { CryptoService } from "./crypto.service.js";

export const SETTINGS_KEY_VERCEL_OAUTH = "vercel_oauth" as const;
export const SETTINGS_KEY_SUPABASE_OAUTH = "supabase_oauth" as const;

@Injectable()
export class OAuthTokenRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly crypto: CryptoService,
  ) {}

  async readEncrypted<T>(userId: string, key: string): Promise<T | null> {
    const [row] = await this.db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.userId, userId), eq(settings.key, key)));
    if (!row || !this.crypto.isEncryptedBlob(row.value)) return null;
    try {
      return JSON.parse(await this.crypto.decryptString(row.value)) as T;
    } catch {
      // Corrupt blob or key mismatch — treat as no token rather than 500.
      return null;
    }
  }

  async writeEncrypted<T>(userId: string, key: string, value: T): Promise<void> {
    const blob = await this.crypto.encryptString(JSON.stringify(value));
    await this.db
      .insert(settings)
      .values({ userId, key, value: blob })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value: blob, updatedAt: new Date() },
      });
  }

  async deleteByKey(userId: string, key: string): Promise<void> {
    await this.db.delete(settings).where(and(eq(settings.userId, userId), eq(settings.key, key)));
  }
}
