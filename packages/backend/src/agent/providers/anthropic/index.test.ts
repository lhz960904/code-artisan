import { describe, it, expect, vi } from "vitest";
import type { Message } from "@code-artisan/shared";

// Mock env to avoid Zod validation of missing env vars in CI
vi.mock("../../../env.js", () => ({
  env: {
    ANTHROPIC_API_KEY: "test-key",
    DATABASE_URL: "test",
    SUPABASE_URL: "test",
    SUPABASE_PUBLISHABLE_KEY: "test",
    SUPABASE_SECRET_KEY: "test",
    E2B_API_KEY: "test",
  },
}));

import { toAnthropicMessages } from "./index.js";

function msg(id: string, role: Message["role"], parts: Message["parts"], metadata?: Record<string, unknown>): Message {
  return { id, role, parts, metadata, createdAt: new Date().toISOString() };
}

describe("toAnthropicMessages", () => {
  it("converts simple user + assistant text conversation", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "hello" }]),
      msg("2", "assistant", [{ type: "text", text: "hi there" }]),
    ];

    const result = toAnthropicMessages(messages);

    expect(result).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: [{ type: "text", text: "hi there" }] },
    ]);
  });

  it("handles single tool call with result", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "list files" }]),
      msg("2", "assistant", [{ type: "text", text: "I'll list the files." }]),
      msg("3", "tool", [{
        type: "tool-call",
        toolCallId: "toolu_1",
        toolName: "ls",
        input: { path: "/tmp" },
        state: "result",
        output: "file1.txt\nfile2.txt",
      }]),
    ];

    const result = toAnthropicMessages(messages);

    expect(result).toHaveLength(3);
    // assistant should have text + tool_use
    expect(result[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "I'll list the files." },
        { type: "tool_use", id: "toolu_1", name: "ls", input: { path: "/tmp" } },
      ],
    });
    // tool_result in user message
    expect(result[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: "file1.txt\nfile2.txt" },
      ],
    });
  });

  it("handles multiple consecutive tool calls (the bug we fixed)", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "write and run" }]),
      msg("2", "assistant", [{ type: "text", text: "I'll write then run." }]),
      msg("3", "tool", [{
        type: "tool-call",
        toolCallId: "toolu_1",
        toolName: "write_file",
        input: { path: "/tmp/a.py", content: "print('hi')" },
        state: "result",
        output: "OK",
      }]),
      msg("4", "tool", [{
        type: "tool-call",
        toolCallId: "toolu_2",
        toolName: "bash",
        input: { command: "python /tmp/a.py" },
        state: "result",
        output: "hi",
      }]),
    ];

    const result = toAnthropicMessages(messages);

    expect(result).toHaveLength(3);
    // assistant should have text + BOTH tool_use blocks
    const assistantContent = result[1].content as unknown[];
    expect(assistantContent).toHaveLength(3);
    expect(assistantContent[0]).toEqual({ type: "text", text: "I'll write then run." });
    expect(assistantContent[1]).toMatchObject({ type: "tool_use", id: "toolu_1", name: "write_file" });
    expect(assistantContent[2]).toMatchObject({ type: "tool_use", id: "toolu_2", name: "bash" });

    // single user message with BOTH tool_results
    const toolResults = result[2].content as unknown[];
    expect(toolResults).toHaveLength(2);
    expect(toolResults[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(toolResults[1]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_2" });
  });

  it("preserves thinking block signature", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "think about this" }]),
      msg("2", "assistant", [
        { type: "thinking", thinking: "Let me think...", signature: "sig_abc123" },
        { type: "text", text: "Here's my answer." },
      ]),
    ];

    const result = toAnthropicMessages(messages);

    const assistantContent = result[1].content as unknown[];
    expect(assistantContent[0]).toMatchObject({
      type: "thinking",
      thinking: "Let me think...",
      signature: "sig_abc123",
    });
  });

  it("skips thinking blocks without signature", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "test" }]),
      msg("2", "assistant", [
        { type: "thinking", thinking: "no sig" },
        { type: "text", text: "answer" },
      ]),
    ];

    const result = toAnthropicMessages(messages);

    const assistantContent = result[1].content as unknown[];
    // Only text, no thinking (signature missing)
    expect(assistantContent).toHaveLength(1);
    expect(assistantContent[0]).toEqual({ type: "text", text: "answer" });
  });

  it("skips confirm response messages", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "do something" }]),
      msg("2", "user", [{ type: "text", text: "Approved" }], { confirmResponse: { approved: true } }),
      msg("3", "assistant", [{ type: "text", text: "ok" }]),
    ];

    const result = toAnthropicMessages(messages);

    // Only 2 messages (confirm response skipped)
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "do something" });
    expect(result[1].role).toBe("assistant");
  });

  it("handles multi-turn conversation with tools", () => {
    const messages: Message[] = [
      // Turn 1: user asks
      msg("1", "user", [{ type: "text", text: "create a file" }]),
      // Turn 1: assistant responds with tool
      msg("2", "assistant", [{ type: "text", text: "Creating file." }]),
      msg("3", "tool", [{
        type: "tool-call",
        toolCallId: "toolu_1",
        toolName: "write_file",
        input: { path: "/tmp/test.py", content: "print(1)" },
        state: "result",
        output: "OK",
      }]),
      // Turn 1: assistant final response
      msg("4", "assistant", [{ type: "text", text: "File created." }]),
      // Turn 2: user asks again
      msg("5", "user", [{ type: "text", text: "now run it" }]),
      // Turn 2: assistant with tool
      msg("6", "assistant", [{ type: "text", text: "Running." }]),
      msg("7", "tool", [{
        type: "tool-call",
        toolCallId: "toolu_2",
        toolName: "bash",
        input: { command: "python /tmp/test.py" },
        state: "result",
        output: "1",
      }]),
      // Turn 2: final
      msg("8", "assistant", [{ type: "text", text: "Output is 1." }]),
    ];

    const result = toAnthropicMessages(messages);

    // Expected: user, assistant(text+tool_use), user(tool_result), assistant(text), user, assistant(text+tool_use), user(tool_result), assistant(text)
    expect(result).toHaveLength(8);
    expect(result[0]).toEqual({ role: "user", content: "create a file" });
    expect(result[1].role).toBe("assistant");
    expect(result[2].role).toBe("user"); // tool_result
    expect(result[3].role).toBe("assistant"); // "File created."
    expect(result[4]).toEqual({ role: "user", content: "now run it" });
    expect(result[5].role).toBe("assistant");
    expect(result[6].role).toBe("user"); // tool_result
    expect(result[7].role).toBe("assistant"); // "Output is 1."

    // Verify alternating roles (Anthropic requirement)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].role).not.toBe(result[i - 1].role);
    }
  });

  it("handles tool in call state (no result yet)", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "do it" }]),
      msg("2", "assistant", [{ type: "text", text: "doing" }]),
      msg("3", "tool", [{
        type: "tool-call",
        toolCallId: "toolu_1",
        toolName: "bash",
        input: { command: "echo hi" },
        state: "call",
        // no output yet
      }]),
    ];

    const result = toAnthropicMessages(messages);

    // assistant should have tool_use
    const assistantContent = result[1].content as unknown[];
    expect(assistantContent).toHaveLength(2);
    expect(assistantContent[1]).toMatchObject({ type: "tool_use", id: "toolu_1" });

    // No tool_result (state is still "call")
    expect(result).toHaveLength(2);
  });
});
