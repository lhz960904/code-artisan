import { describe, it, expect, vi } from "vitest";
import { DanglingToolCallMiddleware } from "../dangling-tool-call.js";
import type { AgentRuntime } from "../../types.js";
import type { Message, ToolCallPart } from "@code-artisan/shared";

function msg(id: string, role: Message["role"], parts: Message["parts"]): Message {
  return { id, role, parts, createdAt: new Date().toISOString() };
}

function makeRuntime(messages: Message[]): AgentRuntime {
  return {
    conversationId: "test-conv",
    messages,
    store: {
      updatePart: vi.fn(),
    },
  } as unknown as AgentRuntime;
}

describe("DanglingToolCallMiddleware", () => {
  it("does nothing when no tool messages", async () => {
    const mw = new DanglingToolCallMiddleware();
    const runtime = makeRuntime([
      msg("1", "user", [{ type: "text", text: "hello" }]),
      msg("2", "assistant", [{ type: "text", text: "hi" }]),
    ]);

    await mw.beforeAgent(runtime);

    expect(runtime.store.updatePart).not.toHaveBeenCalled();
  });

  it("does nothing when tool call has result", async () => {
    const mw = new DanglingToolCallMiddleware();
    const runtime = makeRuntime([
      msg("1", "user", [{ type: "text", text: "do it" }]),
      msg("2", "assistant", [{ type: "text", text: "ok" }]),
      msg("3", "tool", [{
        type: "tool-call",
        toolCallId: "toolu_1",
        toolName: "bash",
        input: { command: "echo hi" },
        state: "result",
        output: "hi",
      }]),
    ]);

    await mw.beforeAgent(runtime);

    expect(runtime.store.updatePart).not.toHaveBeenCalled();
  });

  it("fixes dangling tool call (state=call, no approval)", async () => {
    const mw = new DanglingToolCallMiddleware();
    const danglingPart: ToolCallPart = {
      type: "tool-call",
      toolCallId: "toolu_1",
      toolName: "bash",
      input: { command: "echo hi" },
      state: "call",
    };
    const runtime = makeRuntime([
      msg("1", "user", [{ type: "text", text: "do it" }]),
      msg("2", "assistant", [{ type: "text", text: "ok" }]),
      msg("3", "tool", [danglingPart]),
    ]);

    await mw.beforeAgent(runtime);

    // In-memory state updated
    expect(danglingPart.state).toBe("error");
    expect(danglingPart.output).toContain("interrupted");

    // DB updated
    expect(runtime.store.updatePart).toHaveBeenCalledWith("3", 0, {
      state: "error",
      output: expect.stringContaining("interrupted"),
    });
  });

  it("does NOT fix tool call with pending approval (confirm mode)", async () => {
    const mw = new DanglingToolCallMiddleware();
    const pendingPart: ToolCallPart = {
      type: "tool-call",
      toolCallId: "toolu_1",
      toolName: "bash",
      input: { command: "echo hi" },
      state: "call",
      approval: "pending",
    };
    const runtime = makeRuntime([
      msg("1", "user", [{ type: "text", text: "do it" }]),
      msg("2", "assistant", [{ type: "text", text: "ok" }]),
      msg("3", "tool", [pendingPart]),
    ]);

    await mw.beforeAgent(runtime);

    // Should NOT touch it — it's waiting for user approval
    expect(pendingPart.state).toBe("call");
    expect(runtime.store.updatePart).not.toHaveBeenCalled();
  });

  it("fixes multiple dangling tool calls", async () => {
    const mw = new DanglingToolCallMiddleware();
    const dangling1: ToolCallPart = {
      type: "tool-call",
      toolCallId: "toolu_1",
      toolName: "write_file",
      input: { path: "/a.txt", content: "a" },
      state: "call",
    };
    const dangling2: ToolCallPart = {
      type: "tool-call",
      toolCallId: "toolu_2",
      toolName: "bash",
      input: { command: "echo hi" },
      state: "call",
    };
    const runtime = makeRuntime([
      msg("1", "user", [{ type: "text", text: "do it" }]),
      msg("2", "assistant", [{ type: "text", text: "ok" }]),
      msg("3", "tool", [dangling1]),
      msg("4", "tool", [dangling2]),
    ]);

    await mw.beforeAgent(runtime);

    expect(dangling1.state).toBe("error");
    expect(dangling2.state).toBe("error");
    expect(runtime.store.updatePart).toHaveBeenCalledTimes(2);
  });
});
