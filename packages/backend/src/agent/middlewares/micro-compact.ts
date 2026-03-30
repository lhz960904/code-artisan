import type { AgentMiddleware, AgentRuntime } from "../types.js";
import type { ToolCallPart } from "@code-artisan/shared";

const DEFAULT_KEEP_RECENT = 8;

/**
 * L1: MicroCompact — replace old tool outputs with placeholders before each LLM call.
 * In-memory only; DB retains original outputs.
 */
export class MicroCompactMiddleware implements AgentMiddleware {
  name = "micro-compact";
  private keepRecent: number;

  constructor(keepRecent = DEFAULT_KEEP_RECENT) {
    this.keepRecent = keepRecent;
  }

  async beforeModel(runtime: AgentRuntime): Promise<void> {
    // Collect all tool result parts (with message reference) in order
    const toolResults: ToolCallPart[] = [];

    for (const msg of runtime.messages) {
      if (msg.role !== "tool") continue;
      for (const part of msg.parts) {
        if (part.type === "tool-call" && part.state === "result" && part.output) {
          toolResults.push(part);
        }
      }
    }

    if (toolResults.length <= this.keepRecent) return;

    // Replace older outputs with placeholder
    const toReplace = toolResults.slice(0, -this.keepRecent);
    for (const part of toReplace) {
      part.output = `[Previous tool call output omitted: used ${part.toolName}]`;
    }
  }
}
