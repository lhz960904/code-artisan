import type { AgentMiddleware, AgentRuntime } from "../types.js";

/**
 * Fixes dangling tool_calls that have no corresponding tool_result.
 * This happens when the agent is interrupted mid-execution (user refresh, crash).
 * Without this fix, Claude API rejects the message history.
 */
export class DanglingToolCallMiddleware implements AgentMiddleware {
  name = "dangling-tool-call";

  async beforeAgent(runtime: AgentRuntime): Promise<void> {
    const { messages } = runtime;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

      const toolUseBlocks = msg.content.filter(
        (b) => typeof b === "object" && "type" in b && b.type === "tool_use",
      );
      if (toolUseBlocks.length === 0) continue;

      // Check if next message has matching tool_results
      const nextMsg = messages[i + 1];
      if (
        nextMsg?.role === "user" &&
        Array.isArray(nextMsg.content) &&
        nextMsg.content.some(
          (b) => typeof b === "object" && "type" in b && b.type === "tool_result",
        )
      ) {
        continue; // Has tool_result, not dangling
      }

      // Dangling! Insert synthetic tool_results
      const syntheticResults = toolUseBlocks.map((b) => ({
        type: "tool_result" as const,
        tool_use_id: (b as { id: string }).id,
        content: "Error: Tool execution was interrupted. Please retry if needed.",
      }));

      messages.splice(i + 1, 0, {
        role: "user",
        content: syntheticResults,
      });
    }
  }
}
