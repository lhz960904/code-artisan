import { describe, it, expect } from "bun:test";
import { loopDetectionMiddleware } from "./index";
import type { AgentContext, ModelContext } from "../../types/agent";
import type { AssistantMessage, ToolUseContent } from "../../types/messages";
import type { LLMProvider } from "../../types/provider";

const noopModel = {
  invoke: async () => ({ role: "assistant" as const, content: [{ type: "text" as const, text: "" }] }),
  stream: async function* () {},
} as unknown as LLMProvider;

function makeCtx(): AgentContext {
  return { prompt: "", messages: [], tools: [], model: noopModel };
}

function makeModelContext(): ModelContext {
  return { prompt: "", messages: [], tools: [] };
}

function assistantWithToolUses(toolUses: Array<{ id: string; name: string; input: unknown }>): AssistantMessage {
  return {
    role: "assistant",
    content: toolUses.map(
      (tu): ToolUseContent => ({
        type: "tool_use",
        id: tu.id,
        name: tu.name,
        input: tu.input as Record<string, unknown>,
      }),
    ),
  };
}

describe("loopDetectionMiddleware", () => {
  it("does nothing when the assistant message has no tool uses", async () => {
    const mw = loopDetectionMiddleware();
    const agentContext = makeCtx();
    const message: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
    };

    await mw.afterModel!({ agentContext, modelContext: makeModelContext(), message });

    expect(agentContext.shouldStop).toBeUndefined();
    expect(agentContext.messages).toHaveLength(0);
  });

  it("injects a warning when the same tool call reaches the warn threshold", async () => {
    const mw = loopDetectionMiddleware({ warnThreshold: 3, hardLimit: 10 });
    const agentContext = makeCtx();

    const sameCall = { id: "c", name: "greet", input: { name: "X" } };

    // Three identical tool calls → hits warn threshold
    for (let i = 0; i < 3; i++) {
      await mw.afterModel!({
        agentContext,
        modelContext: makeModelContext(),
        message: assistantWithToolUses([{ ...sameCall, id: `c${i}` }]),
      });
    }

    expect(agentContext.shouldStop).toBeUndefined();
    expect(agentContext.messages).toHaveLength(1);
    const warn = agentContext.messages[0];
    expect(warn?.role).toBe("user");
    expect((warn as any).content[0].text).toContain("Warning");
  });

  it("sets shouldStop when the same tool call reaches the hard limit", async () => {
    const mw = loopDetectionMiddleware({ warnThreshold: 3, hardLimit: 5 });
    const agentContext = makeCtx();

    const sameCall = { id: "c", name: "greet", input: { name: "Y" } };

    for (let i = 0; i < 5; i++) {
      await mw.afterModel!({
        agentContext,
        modelContext: makeModelContext(),
        message: assistantWithToolUses([{ ...sameCall, id: `c${i}` }]),
      });
    }

    expect(agentContext.shouldStop).toBe(true);
    // A stop system-message is injected alongside the warning
    const stopMsg = agentContext.messages.find((m) =>
      (m as any).content[0]?.text?.includes("Repetitive tool call pattern"),
    );
    expect(stopMsg).toBeDefined();
  });

  it("does NOT trigger when tool calls differ each iteration", async () => {
    const mw = loopDetectionMiddleware({ warnThreshold: 3, hardLimit: 5 });
    const agentContext = makeCtx();

    for (let i = 0; i < 6; i++) {
      await mw.afterModel!({
        agentContext,
        modelContext: makeModelContext(),
        message: assistantWithToolUses([{ id: `c${i}`, name: "greet", input: { name: `person-${i}` } }]),
      });
    }

    expect(agentContext.shouldStop).toBeUndefined();
    expect(agentContext.messages).toHaveLength(0);
  });

  it("emits the warning at most once per session", async () => {
    const mw = loopDetectionMiddleware({ warnThreshold: 3, hardLimit: 10 });
    const agentContext = makeCtx();
    const sameCall = { name: "greet", input: { name: "Z" } };

    for (let i = 0; i < 5; i++) {
      await mw.afterModel!({
        agentContext,
        modelContext: makeModelContext(),
        message: assistantWithToolUses([{ ...sameCall, id: `c${i}` }]),
      });
    }

    const warns = agentContext.messages.filter((m) => (m as any).content[0]?.text?.includes("Warning"));
    expect(warns).toHaveLength(1);
  });

  it("window rolls off old hashes", async () => {
    const mw = loopDetectionMiddleware({ windowSize: 3, warnThreshold: 3, hardLimit: 5 });
    const agentContext = makeCtx();

    // Two repeats of 'A', then three unique calls — 'A' should fall out of window
    await mw.afterModel!({
      agentContext,
      modelContext: makeModelContext(),
      message: assistantWithToolUses([{ id: "1", name: "A", input: {} }]),
    });
    await mw.afterModel!({
      agentContext,
      modelContext: makeModelContext(),
      message: assistantWithToolUses([{ id: "2", name: "A", input: {} }]),
    });
    await mw.afterModel!({
      agentContext,
      modelContext: makeModelContext(),
      message: assistantWithToolUses([{ id: "3", name: "B", input: {} }]),
    });
    await mw.afterModel!({
      agentContext,
      modelContext: makeModelContext(),
      message: assistantWithToolUses([{ id: "4", name: "C", input: {} }]),
    });
    await mw.afterModel!({
      agentContext,
      modelContext: makeModelContext(),
      message: assistantWithToolUses([{ id: "5", name: "D", input: {} }]),
    });

    // At this point window is [C, D] effectively (size 3 minus 2 pushed above); or [B, C, D].
    // Either way 'A' has rolled off, no warning should exist.
    expect(agentContext.messages).toHaveLength(0);
  });
});
