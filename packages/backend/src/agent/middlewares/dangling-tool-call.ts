import type { AgentMiddleware, AgentRuntime } from "../types.js";
import type { ToolCallPart } from "@code-artisan/shared";

/**
 * Fixes dangling tool_calls that have no corresponding tool_result.
 * This happens when the agent is interrupted mid-execution (user refresh, crash).
 *
 * Scans messages: if a tool message has ToolCallPart with state="call" (never executed),
 * updates it to state="error" so the LLM can see the interruption and retry.
 */
export class DanglingToolCallMiddleware implements AgentMiddleware {
  name = "dangling-tool-call";

  async beforeAgent(runtime: AgentRuntime): Promise<void> {
    const { messages } = runtime;

    for (const msg of messages) {
      if (msg.role !== "tool") continue;

      for (const part of msg.parts) {
        if (part.type !== "tool-call") continue;
        const toolPart = part as ToolCallPart;

        // If still in "call" state, it was never executed — mark as error
        if (toolPart.state === "call" && !toolPart.approval) {
          toolPart.state = "error";
          toolPart.output = "Error: Tool execution was interrupted. Please retry if needed.";

          // Also update in DB
          const partIndex = msg.parts.indexOf(part);
          await runtime.store.updatePart(msg.id, partIndex, {
            state: "error",
            output: toolPart.output,
          });
        }
      }
    }
  }
}
