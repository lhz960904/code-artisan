import { createHash } from "crypto";
import type { AgentMiddleware, AgentRuntime, LLMResponse } from "../types.js";
import { getToolCalls, hasToolCalls } from "../types.js";

const WINDOW_SIZE = 20;
const WARN_THRESHOLD = 3;
const HARD_LIMIT = 5;

/**
 * Detects repetitive tool call patterns to prevent infinite loops.
 * - Hash each tool call (name + args) into a short digest
 * - Track in a sliding window of last N calls
 * - 3 repeats: inject warning message
 * - 5 repeats: force stop
 */
export class LoopDetectionMiddleware implements AgentMiddleware {
  name = "loop-detection";

  private callHashes: string[] = [];

  async afterModel(runtime: AgentRuntime, response: LLMResponse): Promise<void> {
    if (!hasToolCalls(response)) return;

    for (const tc of getToolCalls(response)) {
      const hash = createHash("md5")
        .update(`${tc.name}:${JSON.stringify(tc.input)}`)
        .digest("hex")
        .slice(0, 12);

      this.callHashes.push(hash);
    }

    // Keep sliding window
    if (this.callHashes.length > WINDOW_SIZE) {
      this.callHashes = this.callHashes.slice(-WINDOW_SIZE);
    }

    // Count max repetitions of any single hash
    const counts = new Map<string, number>();
    for (const h of this.callHashes) {
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }

    const maxCount = Math.max(...counts.values());

    if (maxCount >= HARD_LIMIT) {
      console.warn(`[loop-detection] Hard limit reached (${maxCount}x) for conversation ${runtime.conversationId}. Stopping.`);
      runtime.shouldStop = true;
      // Add a message so LLM knows why it stopped
      runtime.messages.push({
        role: "user",
        content:
          "SYSTEM: Repetitive tool call pattern detected. You have been calling the same tool with the same arguments multiple times. Please take a different approach or explain what you're trying to achieve.",
      });
    } else if (maxCount >= WARN_THRESHOLD) {
      console.warn(`[loop-detection] Warning: ${maxCount}x repetition detected for conversation ${runtime.conversationId}.`);
      // Inject warning into messages so LLM can self-correct
      runtime.messages.push({
        role: "user",
        content:
          "SYSTEM: Warning — you appear to be repeating the same tool call. Please verify your approach is making progress and try a different strategy if needed.",
      });
    }
  }
}
