import type { AgentMiddleware } from "../../types/middleware";
import type { Message, ToolMessage, AssistantMessage, ToolResultContent, ToolUseContent } from "../../types/messages";

const DEFAULT_KEEP_RECENT = 10;

export interface MicroCompactOptions {
  /** Number of most-recent tool results to preserve verbatim. Older ones are stubbed. */
  keepRecent?: number;
}

/**
 * MicroCompact — the lightest form of context compression.
 *
 * Before each model call, if more than `keepRecent` tool results exist in
 * the message history, the older ones have their content replaced by a
 * short placeholder. Recent tool results stay verbatim.
 *
 * Operates only on the in-memory message array (no DB, no LLM call).
 * The mutation persists across steps within a single invoke() —
 * consumers that care about the original outputs should keep them in
 * their own storage.
 */
export function microCompactMiddleware(options: MicroCompactOptions = {}): AgentMiddleware {
  const keepRecent = options.keepRecent ?? DEFAULT_KEEP_RECENT;

  return {
    beforeModel: async ({ agentContext }) => {
      const nameByToolUseId = buildToolNameMap(agentContext.messages);

      // Collect every ToolResultContent across all ToolMessages in order.
      const allResults: ToolResultContent[] = [];
      for (const msg of agentContext.messages) {
        if (msg.role !== "tool") continue;
        for (const c of (msg as ToolMessage).content) {
          if (c.type === "tool_result") allResults.push(c);
        }
      }

      if (allResults.length <= keepRecent) return;

      const stubCount = allResults.length - keepRecent;
      for (let i = 0; i < stubCount; i++) {
        const r = allResults[i]!;
        // Already stubbed? Skip — prevents re-stubbing across successive calls.
        if (r.content.startsWith("[Previous tool call output omitted")) continue;
        const toolName = nameByToolUseId.get(r.tool_use_id) ?? "tool";
        r.content = `[Previous tool call output omitted: used ${toolName}]`;
      }
    },
  };
}

function buildToolNameMap(messages: Message[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const c of (msg as AssistantMessage).content) {
      if (c.type === "tool_use") {
        const tu = c as ToolUseContent;
        map.set(tu.id, tu.name);
      }
    }
  }
  return map;
}
