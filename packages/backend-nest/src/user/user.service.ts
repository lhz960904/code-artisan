import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { userQuotas } from "../db/schema.js";

const DEFAULT_TOTAL_TOKENS = 1_000_000;

@Injectable()
export class UserService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getQuota(userId: string) {
    const [row] = await this.db.select().from(userQuotas).where(eq(userQuotas.userId, userId));
    if (!row) {
      return {
        totalTokens: DEFAULT_TOTAL_TOKENS,
        usedTokens: 0,
        remaining: DEFAULT_TOTAL_TOKENS,
      };
    }
    return {
      totalTokens: row.totalTokens,
      usedTokens: row.usedTokens,
      remaining: row.totalTokens - row.usedTokens,
    };
  }
}
