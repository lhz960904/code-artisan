import type { AgentMiddleware } from "@code-artisan/agent";
import { findModel } from "@code-artisan/shared";
import { LRUCache } from "lru-cache";
import { db } from "../../db";
import { userQuotas } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * In-memory quota cache keyed by userId. Saves a DB round-trip on every
 * model call *within a turn*. Source of truth stays in Postgres — the
 * `beforeAgentRun` hook force-reloads at the start of every turn, so
 * admin-side top-ups (or any external DB write) take effect on the very
 * next user message. Within a turn we trust the cache: `afterModel`
 * bumps it synchronously after every model response and fire-and-forgets
 * the DB write so the agent loop isn't blocked on persistence.
 */
interface CachedQuota {
  totalTokens: number;
  usedTokens: number;
}

const quotaCache = new LRUCache<string, CachedQuota>({
  max: 1000,
  // Keep entries for a while so single-turn operations share a cache entry
  // across their internal `beforeModel` checks. `beforeAgentRun` refreshes
  // from DB, so the cache only has to live long enough to cover one turn.
  ttl: 5 * 60 * 1000,
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

/** Returns true if the user has no tokens remaining. Uses the same LRU cache. */
export async function isQuotaExceeded(userId: string): Promise<boolean> {
  const quota = quotaCache.get(userId) ?? (await loadQuota(userId));
  return quota.totalTokens - quota.usedTokens <= 0;
}

/**
 * Check quota before every LLM call. If quota is exhausted, signal the
 * agent to stop cooperatively. Token usage is multiplied by the model's
 * `tokenMultiplier` at billing time so premium models burn the user's
 * quota faster.
 */
export function checkQuotaMiddleware(
  userId: string,
  modelId: string,
  onExceeded?: () => void,
): AgentMiddleware {
  const multiplier = findModel(modelId)?.tokenMultiplier ?? 1;

  return {
    beforeAgentRun: async () => {
      // Force-reload from DB at the start of every turn so admin-side
      // top-ups (or any out-of-band quota write) are picked up immediately.
      // Otherwise a user who exhausts their quota and tops up would stay
      // blocked until the cache entry expires or the process restarts.
      const quota = await loadQuota(userId);
      if (quota.totalTokens - quota.usedTokens <= 0) {
        onExceeded?.();
        return { shouldStop: true };
      }
    },
    beforeModel: async ({ agentContext }) => {
      if (await isQuotaExceeded(userId)) {
        agentContext.shouldStop = true;
        onExceeded?.();
      }
    },
    afterModel: async ({ message }) => {
      const usage = message.usage;
      if (!usage) return;
      const billedTokens = (usage.inputTokens + usage.outputTokens) * multiplier;

      // Bump the in-memory cache immediately so the next beforeModel sees
      // the latest value without waiting for DB.
      const cached = quotaCache.get(userId);
      if (cached) cached.usedTokens += billedTokens;

      // Persist asynchronously. `sql\`+ N\`` is a DB-side increment, so
      // concurrent turns converge correctly even if their in-memory caches
      // briefly diverge from DB.
      void (async () => {
        try {
          await db
            .update(userQuotas)
            .set({ usedTokens: sql`${userQuotas.usedTokens} + ${billedTokens}` })
            .where(eq(userQuotas.userId, userId));
        } catch (error) {
          console.error("[checkQuota] db update failed:", error);
        }
      })();
    },
  };
}
