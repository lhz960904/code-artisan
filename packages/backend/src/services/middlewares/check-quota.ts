import type { AgentMiddleware } from "@code-artisan/agent";
import { db } from "../../db";
import { userQuotas } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * check quota before every LLM call. if quota is exceeded, stop the agent turn
 */
export function checkQuotaMiddleware(userId: string, onExceeded?: () => void): AgentMiddleware {
  return {
    beforeModel: async ({ agentContext }) => {
      const [quota] = await db.select().from(userQuotas).where(eq(userQuotas.userId, userId));
      const remaining = quota.totalTokens - quota.usedTokens;
      if (remaining <= 0) {
        agentContext.shouldStop = true;
        onExceeded?.();
      }
    },
    afterModel: async ({ message }) => {
      const usage = message.usage;
      if (!usage) return;
      const totalTokenCost = usage.inputTokens + usage.outputTokens;
      try {
        await db
          .update(userQuotas)
          .set({
            usedTokens: sql`${userQuotas.usedTokens} + ${totalTokenCost * 1000}`,
          })
          .where(eq(userQuotas.userId, userId));
      } catch (error) {
        console.error("error updating quota", error);
      }
    },
  };
}
