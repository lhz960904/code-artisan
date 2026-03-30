import { QuotaService } from "../../services/quota.js";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { AgentMiddleware, AgentRuntime, LLMResponse } from "../types.js";

/**
 * Tracks token usage per LLM call and checks quota.
 * Sets runtime.shouldStop if quota exceeded.
 */
export class TokenUsageMiddleware implements AgentMiddleware {
  name = "token-usage";

  private quota: QuotaService | null = null;

  async beforeAgent(runtime: AgentRuntime): Promise<void> {
    const [conv] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, runtime.conversationId));

    const userId = conv?.userId ?? "00000000-0000-0000-0000-000000000000";
    this.quota = new QuotaService(userId);
  }

  async beforeModel(runtime: AgentRuntime): Promise<void> {
    if (!this.quota) return;

    const hasBalance = await this.quota.checkBalance();
    if (!hasBalance) {
      runtime.shouldStop = true;
      const msg = await runtime.store.addMessage("assistant", [
        { type: "error", message: "Token quota exceeded." },
      ]);
      runtime.emitStream({
        messageId: msg.id,
        part: { type: "error", message: "Token quota exceeded." },
      });
    }
  }

  async afterModel(_runtime: AgentRuntime, response: LLMResponse): Promise<void> {
    if (!this.quota) return;
    await this.quota.addUsage(response.usage.input_tokens, response.usage.output_tokens);
  }
}
