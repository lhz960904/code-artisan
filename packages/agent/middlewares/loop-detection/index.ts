import { createHash } from "node:crypto";
import type { AgentMiddleware } from "../../types/middleware";
import type { ToolUseContent } from "../../types/messages";

const DEFAULT_WINDOW_SIZE = 20;
const DEFAULT_WARN_THRESHOLD = 3;
const DEFAULT_HARD_LIMIT = 5;

const WARN_MESSAGE =
  "SYSTEM: Warning — you appear to be repeating the same tool call. Please verify your approach is making progress and try a different strategy if needed.";

const STOP_MESSAGE =
  "SYSTEM: Repetitive tool call pattern detected. You have been calling the same tool with the same arguments multiple times. Please take a different approach or explain what you're trying to achieve.";

export interface LoopDetectionOptions {
  /** Size of the sliding hash window. Older hashes roll off. */
  windowSize?: number;
  /** Repetition count that triggers a warning injected into the conversation. */
  warnThreshold?: number;
  /** Repetition count that triggers cooperative stop (sets agentContext.shouldStop). */
  hardLimit?: number;
}

/**
 * Detects tool-call loops by hashing (name + input) on every assistant
 * response. When the same hash appears ≥ warnThreshold times in the
 * recent window a warning user-message is injected; at ≥ hardLimit the
 * agent is asked to stop cooperatively (via agentContext.shouldStop).
 *
 * This middleware is stateless outside its closure — no DB, no provider.
 */
export function loopDetectionMiddleware(
  options: LoopDetectionOptions = {},
): AgentMiddleware {
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  const warnThreshold = options.warnThreshold ?? DEFAULT_WARN_THRESHOLD;
  const hardLimit = options.hardLimit ?? DEFAULT_HARD_LIMIT;

  const hashes: string[] = [];
  let warned = false;

  return {
    afterModel: async ({ agentContext, message }) => {
      const toolUses = message.content.filter(
        (c): c is ToolUseContent => c.type === "tool_use",
      );
      if (toolUses.length === 0) return;

      for (const tu of toolUses) {
        const hash = createHash("md5")
          .update(`${tu.name}:${JSON.stringify(tu.input)}`)
          .digest("hex")
          .slice(0, 12);
        hashes.push(hash);
      }
      if (hashes.length > windowSize) {
        hashes.splice(0, hashes.length - windowSize);
      }

      const counts = new Map<string, number>();
      let max = 0;
      for (const h of hashes) {
        const next = (counts.get(h) ?? 0) + 1;
        counts.set(h, next);
        if (next > max) max = next;
      }

      if (max >= hardLimit) {
        agentContext.shouldStop = true;
        agentContext.messages.push({
          role: "user",
          content: [{ type: "text", text: STOP_MESSAGE }],
        });
      } else if (max >= warnThreshold && !warned) {
        warned = true;
        agentContext.messages.push({
          role: "user",
          content: [{ type: "text", text: WARN_MESSAGE }],
        });
      }
    },
  };
}
