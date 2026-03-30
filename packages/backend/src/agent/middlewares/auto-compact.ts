import type { AgentMiddleware, AgentRuntime } from "../types.js";
import type { Message, MessagePart } from "@code-artisan/shared";

const DEFAULT_TOKEN_THRESHOLD = 150_000;
const SUMMARY_OUTPUT_LIMIT = 500;
const SERIALIZE_LIMIT = 80_000;

/**
 * L2: AutoCompact — when estimated tokens exceed threshold, generate LLM summary
 * and insert a compaction marker. DB retains all messages; LLM only sees post-marker.
 */
export class AutoCompactMiddleware implements AgentMiddleware {
  name = "auto-compact";
  private tokenThreshold: number;

  constructor(tokenThreshold = DEFAULT_TOKEN_THRESHOLD) {
    this.tokenThreshold = tokenThreshold;
  }

  async beforeModel(runtime: AgentRuntime): Promise<void> {
    // Step 1: Filter to messages after latest compaction marker
    this.filterFromCompactionPoint(runtime);

    // Step 2: Estimate tokens
    const estimated = estimateTokens(runtime.messages);
    if (estimated < this.tokenThreshold) return;

    console.log(`[auto-compact] Estimated ${estimated} tokens (threshold: ${this.tokenThreshold}), compacting...`);

    // Step 3: Generate summary
    const text = serializeForSummary(runtime.messages);
    const summary = await runtime.provider.generateText(buildCompactPrompt(text));

    // Step 4: Persist compaction marker + ack to DB
    const compactMsg = await runtime.store.addMessage("user", [{ type: "text", text: `[Conversation Summary]\n\n${summary}` }], {
      compacted: true,
      originalMessageCount: runtime.messages.length,
      compactedAt: new Date().toISOString(),
    });

    const ackMsg = await runtime.store.addMessage("assistant", [{ type: "text", text: "Understood. Continuing with context from the summary." }]);

    // Step 5: Replace in-memory messages
    runtime.messages.length = 0;
    runtime.messages.push(
      {
        id: compactMsg.id,
        role: "user",
        parts: [{ type: "text", text: `[Conversation Summary]\n\n${summary}` }],
        metadata: { compacted: true },
        createdAt: new Date().toISOString(),
      },
      {
        id: ackMsg.id,
        role: "assistant",
        parts: [{ type: "text", text: "Understood. Continuing with context from the summary." }],
        createdAt: new Date().toISOString(),
      },
    );
  }

  private filterFromCompactionPoint(runtime: AgentRuntime): void {
    // Find last compaction marker
    let lastCompactIdx = -1;
    for (let i = runtime.messages.length - 1; i >= 0; i--) {
      if (runtime.messages[i].metadata?.compacted) {
        lastCompactIdx = i;
        break;
      }
    }

    if (lastCompactIdx >= 0) {
      const filtered = runtime.messages.slice(lastCompactIdx);
      runtime.messages.length = 0;
      runtime.messages.push(...filtered);
    }
  }
}

function estimateTokens(messages: Message[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

function serializeForSummary(messages: Message[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.role.toUpperCase();
    for (const part of msg.parts) {
      if (part.type === "text") {
        lines.push(`[${role}] ${part.text}`);
      } else if (part.type === "tool-call") {
        const output = part.output
          ? part.output.length > SUMMARY_OUTPUT_LIMIT
            ? part.output.slice(0, SUMMARY_OUTPUT_LIMIT) + "..."
            : part.output
          : "";
        lines.push(`[TOOL: ${part.toolName}] ${output}`);
      } else if (part.type === "error") {
        lines.push(`[ERROR] ${part.message}`);
      }
      // Skip thinking, step-start, step-end, image, document
    }
  }

  const text = lines.join("\n");
  return text.length > SERIALIZE_LIMIT ? text.slice(0, SERIALIZE_LIMIT) + "\n[...truncated]" : text;
}

function buildCompactPrompt(conversationText: string): string {
  return `Summarize this coding agent conversation for continuity. Preserve:
1) Files created/modified with key code decisions
2) Current state — what's working, what's failing
3) Important constraints or user preferences mentioned
4) Concrete next steps needed
Be concise but keep file paths, function names, and error details.

Conversation:
${conversationText}`;
}
