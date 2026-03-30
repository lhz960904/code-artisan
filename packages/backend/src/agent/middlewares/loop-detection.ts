import { createHash } from "crypto";
import type { AgentMiddleware, AgentRuntime, LLMResponse } from "../types.js";

const WINDOW_SIZE = 20;
const WARN_THRESHOLD = 3;
const HARD_LIMIT = 5;

export class LoopDetectionMiddleware implements AgentMiddleware {
  name = "loop-detection";

  private callHashes: string[] = [];

  async afterModel(runtime: AgentRuntime, response?: LLMResponse): Promise<void> {
    if (!response || response.toolCalls.length === 0) return;

    for (const tc of response.toolCalls) {
      const hash = createHash("md5")
        .update(`${tc.name}:${JSON.stringify(tc.input)}`)
        .digest("hex")
        .slice(0, 12);

      this.callHashes.push(hash);
    }

    if (this.callHashes.length > WINDOW_SIZE) {
      this.callHashes = this.callHashes.slice(-WINDOW_SIZE);
    }

    const counts = new Map<string, number>();
    for (const h of this.callHashes) {
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }

    const maxCount = Math.max(...counts.values());

    if (maxCount >= HARD_LIMIT) {
      console.warn(
        `[loop-detection] Hard limit reached (${maxCount}x) for conversation ${runtime.conversationId}. Stopping.`,
      );
      runtime.shouldStop = true;
      runtime.messages.push({
        id: `system_${Date.now()}`,
        role: "user",
        parts: [{
          type: "text",
          text: "SYSTEM: Repetitive tool call pattern detected. You have been calling the same tool with the same arguments multiple times. Please take a different approach or explain what you're trying to achieve.",
        }],
        createdAt: new Date().toISOString(),
      });
    } else if (maxCount >= WARN_THRESHOLD) {
      console.warn(
        `[loop-detection] Warning: ${maxCount}x repetition detected for conversation ${runtime.conversationId}.`,
      );
      runtime.messages.push({
        id: `system_${Date.now()}`,
        role: "user",
        parts: [{
          type: "text",
          text: "SYSTEM: Warning — you appear to be repeating the same tool call. Please verify your approach is making progress and try a different strategy if needed.",
        }],
        createdAt: new Date().toISOString(),
      });
    }
  }
}
