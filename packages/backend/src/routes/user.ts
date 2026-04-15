import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { userQuotas } from "../db/schema.js";
import { ok } from "../http/index.js";

const userRouter = new Hono();

const DEFAULT_TOTAL_TOKENS = 1_000_000;

// Get current user profile
userRouter.get("/me", async (c) => {
  const user = c.get("user");
  return ok(c, { id: user.id, name: user.name, email: user.email, image: user.image });
});

// Get current user quota
userRouter.get("/quota", async (c) => {
  const user = c.get("user");
  const [quota] = await db.select().from(userQuotas).where(eq(userQuotas.userId, user.id));

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
