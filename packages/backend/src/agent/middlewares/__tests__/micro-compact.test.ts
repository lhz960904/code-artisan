import { describe, it, expect } from "vitest";
import { MicroCompactMiddleware } from "../micro-compact.js";
import type { AgentRuntime } from "../../types.js";
import type { Message, ToolCallPart } from "@code-artisan/shared";

function toolMsg(id: string, toolName: string, output: string): Message {
  return {
    id,
    role: "tool",
    parts: [
      {
        type: "tool-call",
        toolCallId: `tc_${id}`,
        toolName,
        input: {},
        state: "result",
        output,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

function makeRuntime(messages: Message[]): AgentRuntime {
  return { messages } as unknown as AgentRuntime;
}

describe("MicroCompactMiddleware", () => {
  it("does nothing when tool results <= keepRecent", async () => {
    const mw = new MicroCompactMiddleware(8);
    const messages = Array.from({ length: 5 }, (_, i) => toolMsg(`m${i}`, "bash", `output_${i}`));
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    for (const msg of runtime.messages) {
      const part = msg.parts[0] as ToolCallPart;
      expect(part.output).toContain("output_");
    }
  });

  it("replaces old tool outputs beyond keepRecent", async () => {
    const mw = new MicroCompactMiddleware(3);
    const messages = Array.from({ length: 6 }, (_, i) => toolMsg(`m${i}`, "bash", `long_output_${i}`));
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    // First 3 should be replaced
    for (let i = 0; i < 3; i++) {
      const part = runtime.messages[i].parts[0] as ToolCallPart;
      expect(part.output).toBe("[Previous tool call output omitted: used bash]");
    }
    // Last 3 should be intact
    for (let i = 3; i < 6; i++) {
      const part = runtime.messages[i].parts[0] as ToolCallPart;
      expect(part.output).toBe(`long_output_${i}`);
    }
  });

  it("skips non-result tool parts", async () => {
    const mw = new MicroCompactMiddleware(1);
    const messages: Message[] = [
      {
        id: "m1",
        role: "tool",
        parts: [
          {
            type: "tool-call",
            toolCallId: "tc_1",
            toolName: "bash",
            input: {},
            state: "call", // not "result"
          },
        ],
        createdAt: new Date().toISOString(),
      },
      toolMsg("m2", "bash", "output_2"),
    ];
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    // "call" state part should be untouched
    expect((messages[0].parts[0] as ToolCallPart).state).toBe("call");
    // Only 1 result, keepRecent=1, so it stays intact
    expect((messages[1].parts[0] as ToolCallPart).output).toBe("output_2");
  });

  it("preserves tool name in placeholder", async () => {
    const mw = new MicroCompactMiddleware(1);
    const messages = [toolMsg("m1", "read_file", "file content here"), toolMsg("m2", "bash", "recent output")];
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    const part = runtime.messages[0].parts[0] as ToolCallPart;
    expect(part.output).toBe("[Previous tool call output omitted: used read_file]");
  });

  it("only replaces tool parts with output", async () => {
    const mw = new MicroCompactMiddleware(1);
    const messages: Message[] = [
      {
        id: "m1",
        role: "tool",
        parts: [
          {
            type: "tool-call",
            toolCallId: "tc_1",
            toolName: "bash",
            input: {},
            state: "result",
            // no output field
          },
        ],
        createdAt: new Date().toISOString(),
      },
      toolMsg("m2", "bash", "has output"),
    ];
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    // No output → not touched (and not counted)
    expect((messages[0].parts[0] as ToolCallPart).output).toBeUndefined();
    expect((messages[1].parts[0] as ToolCallPart).output).toBe("has output");
  });

  it("handles mixed message roles", async () => {
    const mw = new MicroCompactMiddleware(2);
    const messages: Message[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }], createdAt: "" },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "hi" }], createdAt: "" },
      toolMsg("t1", "bash", "output_1"),
      toolMsg("t2", "ls", "output_2"),
      { id: "u2", role: "user", parts: [{ type: "text", text: "more" }], createdAt: "" },
      toolMsg("t3", "read_file", "output_3"),
      toolMsg("t4", "write_file", "OK"),
    ];
    const runtime = makeRuntime(messages);

    await mw.beforeModel(runtime);

    // t1, t2 replaced (oldest 2 of 4 total); t3, t4 kept (recent 2)
    expect((messages[2].parts[0] as ToolCallPart).output).toContain("omitted");
    expect((messages[3].parts[0] as ToolCallPart).output).toContain("omitted");
    expect((messages[5].parts[0] as ToolCallPart).output).toBe("output_3");
    expect((messages[6].parts[0] as ToolCallPart).output).toBe("OK");
  });
});
