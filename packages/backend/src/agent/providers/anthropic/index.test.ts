import { describe, it, expect, vi } from "vitest";
import type { Message, MessageStreamEvent } from "@code-artisan/shared";
import type { ToolDefinition } from "../../types.js";

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

import { AnthropicProvider, toAnthropicMessages } from "./index.js";

// ── Helpers ──────────────────────────────────────────────────

function msg(id: string, role: Message["role"], parts: Message["parts"], metadata?: Record<string, unknown>): Message {
  return { id, role, parts, metadata, createdAt: new Date().toISOString() };
}

async function collectEvents(iterable: AsyncIterable<MessageStreamEvent>): Promise<MessageStreamEvent[]> {
  const events: MessageStreamEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function createMockStream(streamEvents: unknown[], errorToThrow?: Error) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of streamEvents) yield e;
      if (errorToThrow) throw errorToThrow;
    },
  };
}

function createMockClient(opts: { streamEvents?: unknown[]; streamError?: Error; createResponse?: unknown }) {
  return {
    messages: {
      stream: vi.fn().mockReturnValue(createMockStream(opts.streamEvents ?? [], opts.streamError)),
      create: vi.fn().mockResolvedValue(opts.createResponse),
    },
  };
}

const defaultParams = {
  model: "claude-sonnet-4-20250514",
  system: "You are helpful.",
  messages: [msg("1", "user", [{ type: "text" as const, text: "hello" }])],
  tools: [] as ToolDefinition[],
};

// ── toAnthropicMessages ──────────────────────────────────────

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
        type: "tool-call", toolCallId: "toolu_1", toolName: "ls",
        input: { path: "/tmp" }, state: "result", output: "file1.txt\nfile2.txt",
      }]),
    ];
    const result = toAnthropicMessages(messages);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "I'll list the files." },
        { type: "tool_use", id: "toolu_1", name: "ls", input: { path: "/tmp" } },
      ],
    });
    expect(result[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "file1.txt\nfile2.txt" }],
    });
  });

  it("handles multiple consecutive tool calls", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "write and run" }]),
      msg("2", "assistant", [{ type: "text", text: "I'll write then run." }]),
      msg("3", "tool", [{
        type: "tool-call", toolCallId: "toolu_1", toolName: "write_file",
        input: { path: "/tmp/a.py", content: "print('hi')" }, state: "result", output: "OK",
      }]),
      msg("4", "tool", [{
        type: "tool-call", toolCallId: "toolu_2", toolName: "bash",
        input: { command: "python /tmp/a.py" }, state: "result", output: "hi",
      }]),
    ];
    const result = toAnthropicMessages(messages);
    expect(result).toHaveLength(3);
    const assistantContent = result[1].content as unknown[];
    expect(assistantContent).toHaveLength(3);
    expect(assistantContent[1]).toMatchObject({ type: "tool_use", id: "toolu_1", name: "write_file" });
    expect(assistantContent[2]).toMatchObject({ type: "tool_use", id: "toolu_2", name: "bash" });
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
      type: "thinking", thinking: "Let me think...", signature: "sig_abc123",
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
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "do something" });
    expect(result[1].role).toBe("assistant");
  });

  it("handles multi-turn conversation with tools", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "create a file" }]),
      msg("2", "assistant", [{ type: "text", text: "Creating file." }]),
      msg("3", "tool", [{
        type: "tool-call", toolCallId: "toolu_1", toolName: "write_file",
        input: { path: "/tmp/test.py", content: "print(1)" }, state: "result", output: "OK",
      }]),
      msg("4", "assistant", [{ type: "text", text: "File created." }]),
      msg("5", "user", [{ type: "text", text: "now run it" }]),
      msg("6", "assistant", [{ type: "text", text: "Running." }]),
      msg("7", "tool", [{
        type: "tool-call", toolCallId: "toolu_2", toolName: "bash",
        input: { command: "python /tmp/test.py" }, state: "result", output: "1",
      }]),
      msg("8", "assistant", [{ type: "text", text: "Output is 1." }]),
    ];
    const result = toAnthropicMessages(messages);
    expect(result).toHaveLength(8);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].role).not.toBe(result[i - 1].role);
    }
  });

  it("skips tool in call state to avoid unpaired tool_use/tool_result", () => {
    const messages: Message[] = [
      msg("1", "user", [{ type: "text", text: "do it" }]),
      msg("2", "assistant", [{ type: "text", text: "doing" }]),
      msg("3", "tool", [{
        type: "tool-call", toolCallId: "toolu_1", toolName: "bash",
        input: { command: "echo hi" }, state: "call",
      }]),
    ];
    const result = toAnthropicMessages(messages);
    const assistantContent = result[1].content as unknown[];
    // tool in "call" state excluded — no tool_use without matching tool_result
    expect(assistantContent).toHaveLength(1);
    expect(assistantContent[0]).toMatchObject({ type: "text", text: "doing" });
    expect(result).toHaveLength(2);
  });
});

// ── AnthropicProvider.stream ─────────────────────────────────

describe("AnthropicProvider.stream", () => {
  it("yields text events with full text in text-end", async () => {
    const client = createMockClient({
      streamEvents: [
        { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ],
    });
    const provider = new AnthropicProvider({ client });
    const events = await collectEvents(provider.stream(defaultParams));

    const textEvents = events.filter(e => e.type.startsWith("text-"));
    expect(textEvents).toEqual([
      { type: "text-start", id: "0" },
      { type: "text-delta", id: "0", delta: "Hello" },
      { type: "text-delta", id: "0", delta: " world" },
      { type: "text-end", id: "0", text: "Hello world" },
    ]);
  });

  it("yields thinking events with full text and signature in thinking-end", async () => {
    const client = createMockClient({
      streamEvents: [
        { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me " } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "think..." } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig_abc" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Answer" } },
        { type: "content_block_stop", index: 1 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 10 } },
        { type: "message_stop" },
      ],
    });
    const provider = new AnthropicProvider({ client });
    const events = await collectEvents(provider.stream(defaultParams));

    const thinkingEvents = events.filter(e => e.type.startsWith("thinking-"));
    expect(thinkingEvents).toEqual([
      { type: "thinking-start", id: "0" },
      { type: "thinking-delta", id: "0", delta: "Let me " },
      { type: "thinking-delta", id: "0", delta: "think..." },
      { type: "thinking-end", id: "0", signature: "sig_abc", text: "Let me think..." },
    ]);
  });

  it("yields tool-input events with full json text in tool-input-end", async () => {
    const client = createMockClient({
      streamEvents: [
        { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "bash" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"com' } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'mand":"ls"}' } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 20 } },
        { type: "message_stop" },
      ],
    });
    const provider = new AnthropicProvider({ client });
    const events = await collectEvents(provider.stream(defaultParams));

    const toolEvents = events.filter(e => e.type.startsWith("tool-input-"));
    expect(toolEvents).toEqual([
      { type: "tool-input-start", toolCallId: "toolu_1", toolName: "bash" },
      { type: "tool-input-delta", toolCallId: "toolu_1", toolName: "bash", delta: '{"com' },
      { type: "tool-input-delta", toolCallId: "toolu_1", toolName: "bash", delta: 'mand":"ls"}' },
      { type: "tool-input-end", toolCallId: "toolu_1", toolName: "bash", text: '{"command":"ls"}' },
    ]);
  });

  it("yields step-start and step-finish lifecycle events", async () => {
    const client = createMockClient({
      streamEvents: [
        { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ],
    });
    const provider = new AnthropicProvider({ client });
    const events = await collectEvents(provider.stream(defaultParams));

    expect(events[0]).toEqual({ type: "step-start" });
    const stepFinish = events.find(e => e.type === "step-finish");
    expect(stepFinish).toEqual({
      type: "step-finish", finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("yields stream-finish as the last event", async () => {
    const client = createMockClient({
      streamEvents: [
        { type: "message_start", message: { usage: { input_tokens: 5, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } },
        { type: "message_stop" },
      ],
    });
    const provider = new AnthropicProvider({ client });
    const events = await collectEvents(provider.stream(defaultParams));

    expect(events[events.length - 1]).toEqual({ type: "stream-finish" });
  });

  it("maps tool_use stop reason to tool_calls finish reason", async () => {
    const client = createMockClient({
      streamEvents: [
        { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "bash" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 15 } },
        { type: "message_stop" },
      ],
    });
    const provider = new AnthropicProvider({ client });
    const events = await collectEvents(provider.stream(defaultParams));

    const stepFinish = events.find(e => e.type === "step-finish");
    expect(stepFinish).toMatchObject({ finishReason: "tool_calls" });
  });

  it("maps max_tokens stop reason correctly", async () => {
    const client = createMockClient({
      streamEvents: [
        { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "truncated" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 16384 } },
        { type: "message_stop" },
      ],
    });
    const provider = new AnthropicProvider({ client });
    const events = await collectEvents(provider.stream(defaultParams));

    const stepFinish = events.find(e => e.type === "step-finish");
    expect(stepFinish).toMatchObject({ finishReason: "max_tokens" });
  });

  it("emits error event when stream throws", async () => {
    const client = createMockClient({
      streamEvents: [],
      streamError: new Error("API error"),
    });
    const provider = new AnthropicProvider({ client });
    const events = await collectEvents(provider.stream(defaultParams));

    const errorEvent = events.find(e => e.type === "error");
    expect(errorEvent).toMatchObject({ type: "error", error: "API error" });
    expect(events[events.length - 1]).toEqual({ type: "stream-finish" });
  });

  it("passes tools to Anthropic API in correct format", async () => {
    const tools: ToolDefinition[] = [{
      name: "bash", description: "Run a command",
      inputSchema: { type: "object", properties: { command: { type: "string" } } },
    }];
    const mockStreamFn = vi.fn().mockReturnValue(createMockStream([
      { type: "message_start", message: { usage: { input_tokens: 5, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
      { type: "message_stop" },
    ]));
    const client = { messages: { stream: mockStreamFn } };
    const provider = new AnthropicProvider({ client });
    await collectEvents(provider.stream({ ...defaultParams, tools }));

    expect(mockStreamFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ name: "bash", description: "Run a command", input_schema: { type: "object", properties: { command: { type: "string" } } } }],
      }),
    );
  });
});

// ── AnthropicProvider.generateText ───────────────────────────

describe("AnthropicProvider.generateText", () => {
  it("returns trimmed text content from response", async () => {
    const client = createMockClient({
      createResponse: {
        id: "msg_123", content: [{ type: "text", text: "  Generated title  " }],
        stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 },
      },
    });
    const provider = new AnthropicProvider({ client });
    const result = await provider.generateText({
      model: "claude-haiku-4-5-20251001", system: "Generate a title",
      messages: [msg("1", "user", [{ type: "text", text: "summarize" }])],
    });
    expect(result).toBe("Generated title");
  });

  it("passes model and system to Anthropic API", async () => {
    const mockCreateFn = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "response" }],
    });
    const client = { messages: { create: mockCreateFn } };
    const provider = new AnthropicProvider({ client });
    await provider.generateText({
      model: "claude-haiku-4-5-20251001", system: "Be concise",
      messages: [msg("1", "user", [{ type: "text", text: "hello" }])],
    });
    expect(mockCreateFn).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001", system: "Be concise" }),
    );
  });
});
