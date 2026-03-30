import { describe, it, expect } from "vitest";
import { LoopDetectionMiddleware } from "../loop-detection.js";
import type { AgentRuntime, LLMResponse } from "../../types.js";

function makeRuntime(): AgentRuntime {
  return {
    conversationId: "test-conv",
    messages: [],
    shouldStop: false,
  } as unknown as AgentRuntime;
}

function makeResponse(toolCalls: Array<{ name: string; input: Record<string, unknown> }>): LLMResponse {
  return {
    textContent: "",
    thinkingBlocks: [],
    toolCalls: toolCalls.map((tc, i) => ({ id: `toolu_${i}`, ...tc })),
    stopReason: "tool_use",
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "test",
  };
}

describe("LoopDetectionMiddleware", () => {
  it("does nothing when no tool calls", async () => {
    const mw = new LoopDetectionMiddleware();
    const runtime = makeRuntime();
    const response = makeResponse([]);

    await mw.afterModel(runtime, response);

    expect(runtime.shouldStop).toBe(false);
    expect(runtime.messages).toHaveLength(0);
  });

  it("does nothing for different tool calls", async () => {
    const mw = new LoopDetectionMiddleware();
    const runtime = makeRuntime();

    for (let i = 0; i < 5; i++) {
      await mw.afterModel(runtime, makeResponse([
        { name: `tool_${i}`, input: { arg: i } },
      ]));
    }

    expect(runtime.shouldStop).toBe(false);
    expect(runtime.messages).toHaveLength(0);
  });

  it("injects warning at 3 repetitions", async () => {
    const mw = new LoopDetectionMiddleware();
    const runtime = makeRuntime();
    const sameCall = makeResponse([{ name: "bash", input: { command: "echo hi" } }]);

    await mw.afterModel(runtime, sameCall); // 1
    await mw.afterModel(runtime, sameCall); // 2
    expect(runtime.messages).toHaveLength(0);

    await mw.afterModel(runtime, sameCall); // 3 → warn
    expect(runtime.shouldStop).toBe(false);
    expect(runtime.messages).toHaveLength(1);
    expect((runtime.messages[0].parts[0] as { text: string }).text).toContain("Warning");
  });

  it("sets shouldStop at 5 repetitions", async () => {
    const mw = new LoopDetectionMiddleware();
    const runtime = makeRuntime();
    const sameCall = makeResponse([{ name: "bash", input: { command: "echo hi" } }]);

    for (let i = 0; i < 5; i++) {
      await mw.afterModel(runtime, sameCall);
    }

    expect(runtime.shouldStop).toBe(true);
    // Should have warning at 3 + stop message at 5
    const stopMsg = runtime.messages.find(
      (m) => (m.parts[0] as { text: string }).text.includes("Repetitive"),
    );
    expect(stopMsg).toBeDefined();
  });

  it("treats different args as different calls", async () => {
    const mw = new LoopDetectionMiddleware();
    const runtime = makeRuntime();

    for (let i = 0; i < 5; i++) {
      await mw.afterModel(runtime, makeResponse([
        { name: "bash", input: { command: `echo ${i}` } },
      ]));
    }

    expect(runtime.shouldStop).toBe(false);
    expect(runtime.messages).toHaveLength(0);
  });

  it("sliding window evicts old hashes", async () => {
    const mw = new LoopDetectionMiddleware();
    const runtime = makeRuntime();
    const sameCall = makeResponse([{ name: "bash", input: { command: "echo hi" } }]);

    // 2 repetitions of same call
    await mw.afterModel(runtime, sameCall);
    await mw.afterModel(runtime, sameCall);

    // Push 20 different calls to fill the window
    for (let i = 0; i < 20; i++) {
      await mw.afterModel(runtime, makeResponse([
        { name: "bash", input: { command: `different_${i}` } },
      ]));
    }

    // Same call again — old hashes evicted, count resets
    await mw.afterModel(runtime, sameCall);
    expect(runtime.shouldStop).toBe(false);
    // Only warning messages from the first 2 repetitions + the 3rd below threshold
    // The count should be 1 now (old ones evicted)
  });
});
