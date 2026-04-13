import type { AgentMiddleware } from "@code-artisan/agent";
import { QuotaService } from "../services/quota.js";

/**
 * TokenUsage as an agent middleware (not runner pre/post) so it
 * checks quota before every LLM call and accumulates usage after
 * each response — matching backend's legacy behavior. Construction
 * takes a pre-built QuotaService (so the runner controls userId
 * and can share the service with its own post-run write-back).
 */
export function tokenUsageMiddleware(
  quota: QuotaService,
  onExceeded?: () => void,
): AgentMiddleware {
  return {
    beforeModel: async ({ agentContext }) => {
      const hasBalance = await quota.checkBalance();
      if (!hasBalance) {
        agentContext.shouldStop = true;
        onExceeded?.();
      }
    },
    afterModel: async ({ message }) => {
      const usage = message.usage;
      if (!usage) return;
      await quota.addUsage(usage.inputTokens, usage.outputTokens);
    },
  };
}
