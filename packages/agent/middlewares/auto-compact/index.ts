import type { AgentMiddleware } from "../../types/middleware";
import type { LLMProvider } from "../../types/provider";
import type { Message, AssistantMessage, UserMessage, ToolUseContent } from "../../types/messages";

// Default threshold is conservative because the built-in token counter
// is `chars / 4`, which underestimates by ~20-30% on code-heavy
// content. Consumers that pass a more accurate `countTokens` can
// safely raise the threshold closer to the model's context limit.
const DEFAULT_TOKEN_THRESHOLD = 120_000;
const SUMMARY_OUTPUT_LIMIT = 500;
const SERIALIZE_LIMIT = 80_000;

const ACK_TEXT = "Understood. Continuing with context from the summary.";

const SUMMARY_SYSTEM_PROMPT = "You are a conversation summarizer for coding agent sessions.";

export interface AutoCompactOptions {
  /**
   * LLM used to produce the summary (e.g. a cheaper Haiku). When omitted,
   * `agentContext.model` from the running agent is used.
   */
  summaryModel?: LLMProvider;
  /**
   * Token count that triggers compaction. Default 120k (conservative
   * for the built-in `chars / 4` counter). Raise this toward the model
   * context limit if you pass a more accurate `countTokens`.
   */
  threshold?: number;
  /**
   * Optional token counter. Receives the current message array and
   * returns an estimated token count. Defaults to a `chars / 4`
   * approximation — fast and dependency-free, but underestimates code
   * and Chinese content. For tighter accounting, pass a tiktoken-based
   * counter or a function that calls the provider's countTokens API.
   */
  countTokens?: (messages: Message[]) => number | Promise<number>;
  /**
   * Invoked after the middleware has replaced `agentContext.messages`
   * with the compaction pair ([summaryUserMsg, ackAssistantMsg]).
   * Consumers (e.g. a backend with DB persistence) should use this
   * hook to durably record the summary so subsequent invokes don't
   * re-hit the token limit.
   */
  onCompacted?: (replacement: [UserMessage, AssistantMessage]) => void | Promise<void>;
}

/**
 * AutoCompact — when the in-memory message history's estimated token
 * count crosses `threshold`, this middleware calls `summaryModel` (or
 * `agentContext.model` if unset) to produce a narrative summary, then replaces `agentContext.messages`
 * with a two-message pair:
 *   - user message carrying "[Conversation Summary]\n\n<summary>"
 *   - assistant acknowledgment
 *
 * No DB or consumer-specific storage is touched; if the consumer needs
 * to persist the compaction (almost always), it provides `onCompacted`.
 */
export function autoCompactMiddleware(options: AutoCompactOptions): AgentMiddleware {
  const threshold = options.threshold ?? DEFAULT_TOKEN_THRESHOLD;
  const { summaryModel, onCompacted, countTokens = defaultCountTokens } = options;

  return {
    beforeModel: async ({ agentContext }) => {
      const estimated = await countTokens(agentContext.messages);
      if (estimated < threshold) return;

      const text = serializeForSummary(agentContext.messages);
      const model = summaryModel ?? agentContext.model;
      const response = await model.invoke({
        messages: [
          { role: "system", content: [{ type: "text", text: SUMMARY_SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "text", text: buildCompactPrompt(text) }] },
        ],
      });
      const summary = extractText(response) || "(summary unavailable)";

      const summaryUser: UserMessage = {
        role: "user",
        content: [{ type: "text", text: `[Conversation Summary]\n\n${summary}` }],
      };
      const ackAssistant: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: ACK_TEXT }],
      };

      // Mutate in place so tools/other middleware still see the same
      // array reference held by the Agent.
      agentContext.messages.length = 0;
      agentContext.messages.push(summaryUser, ackAssistant);

      if (onCompacted) {
        await onCompacted([summaryUser, ackAssistant]);
      }
    },
  };
}

function defaultCountTokens(messages: Message[]): number {
  // chars / 4 rule of thumb — fast, no deps, underestimates code/CJK.
  return Math.ceil(JSON.stringify(messages).length / 4);
}

function extractText(message: AssistantMessage): string {
  return message.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
}

function serializeForSummary(messages: Message[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const roleLabel = msg.role.toUpperCase();
    if (msg.role === "user") {
      for (const c of msg.content) {
        if (c.type === "text") lines.push(`[${roleLabel}] ${c.text}`);
      }
    } else if (msg.role === "assistant") {
      for (const c of msg.content) {
        if (c.type === "text") {
          lines.push(`[${roleLabel}] ${c.text}`);
        } else if (c.type === "tool_use") {
          const tu = c as ToolUseContent;
          lines.push(`[TOOL_USE: ${tu.name}] ${JSON.stringify(tu.input)}`);
        }
      }
    } else if (msg.role === "tool") {
      for (const c of msg.content) {
        if (c.type === "tool_result") {
          const trimmed =
            c.content.length > SUMMARY_OUTPUT_LIMIT ? c.content.slice(0, SUMMARY_OUTPUT_LIMIT) + "..." : c.content;
          lines.push(`[TOOL_RESULT] ${trimmed}`);
        }
      }
    } else if (msg.role === "system") {
      for (const c of msg.content) {
        lines.push(`[SYSTEM] ${c.text}`);
      }
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
