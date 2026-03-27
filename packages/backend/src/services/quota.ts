import { db } from "../db/index.js";
import { userQuotas } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

const DEFAULT_TOTAL_TOKENS = 1_000_000;

export class QuotaService {
  constructor(private userId: string) {}

  async ensureQuotaExists(): Promise<void> {
    await db
      .insert(userQuotas)
      .values({
        userId: this.userId,
        totalTokens: DEFAULT_TOTAL_TOKENS,
        usedTokens: 0,
      })
      .onConflictDoNothing();
  }

  async getQuota(): Promise<{ totalTokens: number; usedTokens: number; remaining: number }> {
    await this.ensureQuotaExists();
    const [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, this.userId));

    return {
      totalTokens: quota.totalTokens,
      usedTokens: quota.usedTokens,
      remaining: quota.totalTokens - quota.usedTokens,
    };
  }

  async checkBalance(): Promise<boolean> {
    const { remaining } = await this.getQuota();
    return remaining > 0;
  }

  async addUsage(inputTokens: number, outputTokens: number): Promise<void> {
    const total = inputTokens + outputTokens;
    await db
      .update(userQuotas)
      .set({
        usedTokens: sql`${userQuotas.usedTokens} + ${total}`,
      })
      .where(eq(userQuotas.userId, this.userId));
  }
}
