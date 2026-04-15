import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { userQuotas } from "../db/schema.js";
import { ok } from "../http/index.js";

const userRouter = new Hono();

// Hardcoded user for now
const HARDCODED_USER_ID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_TOTAL_TOKENS = 1_000_000;

// Get current user quota
userRouter.get("/quota", async (c) => {
  const [quota] = await db
    .select()
    .from(userQuotas)
    .where(eq(userQuotas.userId, HARDCODED_USER_ID));

  if (!quota) {
    return ok(c, {
      totalTokens: DEFAULT_TOTAL_TOKENS,
      usedTokens: 0,
      remaining: DEFAULT_TOTAL_TOKENS,
    });
  }

  return ok(c, {
    totalTokens: quota.totalTokens,
    usedTokens: quota.usedTokens,
    remaining: quota.totalTokens - quota.usedTokens,
  });
});

export { userRouter };
