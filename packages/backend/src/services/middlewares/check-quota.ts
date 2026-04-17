import type { AgentMiddleware } from "@code-artisan/agent";
import { LRUCache } from "lru-cache";
import { db } from "../../db";
import { userQuotas } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * In-memory quota cache keyed by userId. Saves a DB round-trip on every
 * model call. Source of truth stays in Postgres — we lazy-load on first
 * check, update the cache synchronously after each turn, and fire-and-forget
 * the DB write so the agent loop isn't blocked on persistence.
 *
 * Caveats:
 *   - Admin-side quota top-ups aren't picked up until re-load (eviction or
 *     process restart).
 *   - On crash, in-flight token counts may be lost (user gets a tiny freebie).
 * Both are acceptable for MVP.
 */
interface CachedQuota {
  totalTokens: number;
  usedTokens: number;
}

const quotaCache = new LRUCache<string, CachedQuota>({
  max: 1000,
  // 30-minute TTL so admin-side quota top-ups eventually take effect even
  // without process restart; active users stay hot via get() auto-refresh.
  ttl: 30 * 60 * 1000,
  updateAgeOnGet: true,
});
const inflightLoads = new Map<string, Promise<CachedQuota>>();

async function loadQuota(userId: string): Promise<CachedQuota> {
  // Coalesce concurrent loads for the same user into a single DB query.
  const existing = inflightLoads.get(userId);
  if (existing) return existing;

  const pending = (async () => {
    const [row] = await db.select().from(userQuotas).where(eq(userQuotas.userId, userId));
    const entry: CachedQuota = { totalTokens: row.totalTokens, usedTokens: row.usedTokens };
    quotaCache.set(userId, entry);
    return entry;
  })();
  inflightLoads.set(userId, pending);
  try {
    return await pending;
  } finally {
    inflightLoads.delete(userId);
  }
}

/**
 * Check quota before every LLM call. If quota is exhausted, signal the
 * agent to stop cooperatively.
 */
export function checkQuotaMiddleware(userId: string, onExceeded?: () => void): AgentMiddleware {
  return {
    beforeModel: async ({ agentContext }) => {
      // LRUCache.get() with updateAgeOnGet:true already refreshes recency.
      const quota = quotaCache.get(userId) ?? (await loadQuota(userId));
      if (quota.totalTokens - quota.usedTokens <= 0) {
        agentContext.shouldStop = true;
        onExceeded?.();
      }
    },
    afterModel: async ({ message }) => {
      const usage = message.usage;
      if (!usage) return;
      const totalTokenCost = usage.inputTokens + usage.outputTokens;

      // Bump the in-memory cache immediately so the next beforeModel sees
      // the latest value without waiting for DB.
      const cached = quotaCache.get(userId);
      if (cached) cached.usedTokens += totalTokenCost;

      // Persist asynchronously. `sql\`+ N\`` is a DB-side increment, so
      // concurrent turns converge correctly even if their in-memory caches
      // briefly diverge from DB.
      void (async () => {
        try {
          await db
            .update(userQuotas)
            .set({ usedTokens: sql`${userQuotas.usedTokens} + ${totalTokenCost}` })
            .where(eq(userQuotas.userId, userId));
        } catch (error) {
          console.error("[checkQuota] db update failed:", error);
        }
      })();
    },
  };
}
