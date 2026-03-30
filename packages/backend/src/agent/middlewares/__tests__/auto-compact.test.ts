import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoCompactMiddleware } from "../auto-compact.js";
import type { AgentRuntime } from "../../types.js";
import type { Message } from "@code-artisan/shared";

function textMsg(id: string, role: Message["role"], text: string, metadata?: Record<string, unknown>): Message {
  return { id, role, parts: [{ type: "text", text }], metadata, createdAt: new Date().toISOString() };
}

function toolMsg(id: string, output: string): Message {
  return {
    id,
    role: "tool",
    parts: [{
      type: "tool-call",
      toolCallId: `tc_${id}`,
      toolName: "bash",
      input: {},
      state: "result",
      output,
    }],
    createdAt: new Date().toISOString(),
  };
}

function makeRuntime(messages: Message[]): AgentRuntime {
  return {
    messages,
    provider: {
      generateText: vi.fn().mockResolvedValue("Summary: user asked to build a todo app. Files created: /app/index.ts."),
    },
    store: {
      addMessage: vi.fn().mockResolvedValue({ id: `compact_${Date.now()}` }),
    },
  } as unknown as AgentRuntime;
}

let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {}); });

describe("AutoCompactMiddleware", () => {
  it("does nothing when under threshold", async () => {
    const mw = new AutoCompactMiddleware(150_000);
    const messages = [
      textMsg("1", "user", "hello"),
      textMsg("2", "assistant", "hi"),
    ];
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    expect(runtime.messages).toHaveLength(2);
    expect(runtime.provider.generateText).not.toHaveBeenCalled();
  });

  it("triggers compaction when over threshold", async () => {
    // Use very low threshold to trigger easily
    const mw = new AutoCompactMiddleware(10);
    const messages = [
      textMsg("1", "user", "build a todo app with React"),
      textMsg("2", "assistant", "Sure, I will create the files."),
      toolMsg("3", "Created index.ts"),
    ];
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    // Should have called generateText for summary
    expect(runtime.provider.generateText).toHaveBeenCalledOnce();
    // Should have called store.addMessage twice (compaction + ack)
    expect(runtime.store.addMessage).toHaveBeenCalledTimes(2);
    // First call: compaction marker
    const firstCall = (runtime.store.addMessage as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toBe("user");
    expect(firstCall[2]).toMatchObject({ compacted: true });
    // Second call: assistant ack
    const secondCall = (runtime.store.addMessage as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCall[0]).toBe("assistant");
    // runtime.messages replaced with 2 messages
    expect(runtime.messages).toHaveLength(2);
    expect(runtime.messages[0].metadata?.compacted).toBe(true);
  });

  it("filters messages from compaction point", async () => {
    const mw = new AutoCompactMiddleware(150_000);
    const messages = [
      textMsg("old1", "user", "old stuff"),
      textMsg("old2", "assistant", "old reply"),
      textMsg("compact", "user", "[Summary]", { compacted: true }),
      textMsg("ack", "assistant", "Understood."),
      textMsg("new1", "user", "new question"),
    ];
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    // Should have filtered to messages from compaction point onwards
    expect(runtime.messages).toHaveLength(3);
    expect(runtime.messages[0].id).toBe("compact");
    expect(runtime.messages[1].id).toBe("ack");
    expect(runtime.messages[2].id).toBe("new1");
  });

  it("uses latest compaction marker when multiple exist", async () => {
    const mw = new AutoCompactMiddleware(150_000);
    const messages = [
      textMsg("c1", "user", "[Summary 1]", { compacted: true }),
      textMsg("a1", "assistant", "Ack 1"),
      textMsg("mid", "user", "more work"),
      textMsg("c2", "user", "[Summary 2]", { compacted: true }),
      textMsg("a2", "assistant", "Ack 2"),
      textMsg("latest", "user", "latest"),
    ];
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    expect(runtime.messages).toHaveLength(3);
    expect(runtime.messages[0].id).toBe("c2");
  });

  it("includes summary text from generateText in compaction message", async () => {
    const mw = new AutoCompactMiddleware(10);
    const runtime = makeRuntime([
      textMsg("1", "user", "test"),
      textMsg("2", "assistant", "reply"),
    ]);

    await mw.beforeModel(runtime);

    const compactedMsg = runtime.messages[0];
    expect(compactedMsg.parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Summary:"),
    });
  });
});
