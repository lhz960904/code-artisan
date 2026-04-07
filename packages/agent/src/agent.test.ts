import { describe, it, expect, vi, beforeEach } from "vitest";
import * as z from "zod";
import { createAgent } from "./agent";
import { tool } from "./tools/tool";
import type { MessageParam, ChatResponse, ChatStreamEvent, BaseProvider } from "./providers/base";
import type { Sandbox } from "./sandboxs/base";

const mockInvoke = vi.fn();
const mockStream = vi.fn();

const mockProvider = {
  invoke: mockInvoke,
  stream: mockStream,
} as unknown as BaseProvider;

const mockSandbox = {
  id: "mock",
  exec: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  listDir: vi.fn(),
  glob: vi.fn(),
  grep: vi.fn(),
  close: vi.fn(),
} as unknown as Sandbox;

const USER_MESSAGE: MessageParam[] = [{ role: "user", content: "Hello" }];

const fakeResponse: ChatResponse = {
  id: "msg_1",
  content: "Hi!",
  thinking: null,
  tool_calls: [],
  finish_reason: "stop",
  usage: { input_tokens: 10, output_tokens: 5 },
};

describe("createAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return an object with invoke and stream methods", () => {
    const agent = createAgent({ model: mockProvider });
    expect(typeof agent.invoke).toBe("function");
    expect(typeof agent.stream).toBe("function");
  });

  // --- invoke without tools (passthrough) ---

  describe("invoke (no tools)", () => {
    it("should delegate to provider.invoke", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = createAgent({ model: mockProvider });

      const result = await agent.invoke(USER_MESSAGE);

      expect(result).toBe(fakeResponse);
      expect(mockInvoke).toHaveBeenCalledWith({
        messages: USER_MESSAGE,
      });
    });

    it("should merge extra options", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = createAgent({ model: mockProvider });

      await agent.invoke(USER_MESSAGE, {
        temperature: 0.5,
        max_tokens: 2048,
        system: "Be helpful.",
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 2048,
          system: "Be helpful.",
        }),
      );
    });

    it("should propagate errors", async () => {
      mockInvoke.mockRejectedValue(new Error("Provider Error"));
      const agent = createAgent({ model: mockProvider });

      await expect(agent.invoke(USER_MESSAGE)).rejects.toThrow("Provider Error");
    });
  });

  // --- invoke with tools (agent loop) ---

  describe("invoke (with tools)", () => {
    const greetTool = tool({
      name: "greet",
      description: "Greet someone",
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`,
    });

    it("should pass tool definitions to provider", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool],
        sandbox: mockSandbox,
      });

      await agent.invoke(USER_MESSAGE);

      const call = mockInvoke.mock.calls[0][0];
      expect(call.tools).toEqual([greetTool.toToolDefinition()]);
    });

    it("should execute tool calls and loop", async () => {
      // First response: model calls tool
      const toolCallResponse: ChatResponse = {
        id: "msg_1",
        content: null,
        thinking: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "greet", arguments: '{"name":"Alice"}' },
          },
        ],
        finish_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 20 },
      };

      // Second response: model returns final answer
      const finalResponse: ChatResponse = {
        id: "msg_2",
        content: "I greeted Alice for you!",
        thinking: null,
        tool_calls: [],
        finish_reason: "stop",
        usage: { input_tokens: 30, output_tokens: 10 },
      };

      mockInvoke
        .mockResolvedValueOnce(toolCallResponse)
        .mockResolvedValueOnce(finalResponse);

      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool],
        sandbox: mockSandbox,
      });

      const result = await agent.invoke(USER_MESSAGE);

      // Should have called provider twice
      expect(mockInvoke).toHaveBeenCalledTimes(2);

      // Second call should include assistant + tool messages
      const secondCall = mockInvoke.mock.calls[1][0];
      const messages = secondCall.messages as MessageParam[];

      // Original user message
      expect(messages[0]).toEqual(USER_MESSAGE[0]);

      // Assistant message with tool call
      expect(messages[1]).toEqual({
        role: "assistant",
        content: null,
        tool_calls: toolCallResponse.tool_calls,
      });

      // Tool result
      expect(messages[2]).toEqual({
        role: "tool",
        tool_call_id: "call_1",
        content: "Hello, Alice!",
      });

      // Final result
      expect(result.content).toBe("I greeted Alice for you!");
    });

    it("should handle tool execution errors gracefully", async () => {
      const failTool = tool({
        name: "fail",
        description: "Always fails",
        parameters: z.object({}),
        execute: async () => {
          throw new Error("boom");
        },
      });

      const toolCallResponse: ChatResponse = {
        id: "msg_1",
        content: null,
        thinking: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "fail", arguments: "{}" },
          },
        ],
        finish_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockInvoke
        .mockResolvedValueOnce(toolCallResponse)
        .mockResolvedValueOnce(fakeResponse);

      const agent = createAgent({
        model: mockProvider,
        tools: [failTool],
        sandbox: mockSandbox,
      });

      await agent.invoke(USER_MESSAGE);

      // Should still loop — error goes back to LLM
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      const messages = mockInvoke.mock.calls[1][0].messages as MessageParam[];
      const toolMsg = messages[2] as { role: string; content: string };
      expect(toolMsg.content).toContain("boom");
    });

    it("should handle unknown tool name", async () => {
      const toolCallResponse: ChatResponse = {
        id: "msg_1",
        content: null,
        thinking: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "nonexistent", arguments: "{}" },
          },
        ],
        finish_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockInvoke
        .mockResolvedValueOnce(toolCallResponse)
        .mockResolvedValueOnce(fakeResponse);

      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool],
        sandbox: mockSandbox,
      });

      await agent.invoke(USER_MESSAGE);

      const messages = mockInvoke.mock.calls[1][0].messages as MessageParam[];
      const toolMsg = messages[2] as { role: string; content: string };
      expect(toolMsg.content).toContain("nonexistent");
      expect(toolMsg.content).toContain("not found");
    });

    it("should stop after maxIterations", async () => {
      const toolCallResponse: ChatResponse = {
        id: "msg_1",
        content: null,
        thinking: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "greet", arguments: '{"name":"Bob"}' },
          },
        ],
        finish_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      // Always returns tool call — would loop forever without maxIterations
      mockInvoke.mockResolvedValue(toolCallResponse);

      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool],
        sandbox: mockSandbox,
        maxIterations: 3,
      });

      const result = await agent.invoke(USER_MESSAGE);

      // Should stop at maxIterations
      expect(mockInvoke).toHaveBeenCalledTimes(3);
      expect(result).toBe(toolCallResponse); // returns last response
    });

    it("should handle multiple tool calls in one response", async () => {
      const echoTool = tool({
        name: "echo",
        description: "Echo input",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }) => text,
      });

      const multiToolResponse: ChatResponse = {
        id: "msg_1",
        content: null,
        thinking: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "greet", arguments: '{"name":"A"}' },
          },
          {
            id: "call_2",
            type: "function",
            function: { name: "echo", arguments: '{"text":"hi"}' },
          },
        ],
        finish_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 20 },
      };

      mockInvoke
        .mockResolvedValueOnce(multiToolResponse)
        .mockResolvedValueOnce(fakeResponse);

      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool, echoTool],
        sandbox: mockSandbox,
      });

      await agent.invoke(USER_MESSAGE);

      const messages = mockInvoke.mock.calls[1][0].messages as MessageParam[];
      // user + assistant + tool_result_1 + tool_result_2 = 4
      expect(messages).toHaveLength(4);
      expect((messages[2] as any).tool_call_id).toBe("call_1");
      expect((messages[3] as any).tool_call_id).toBe("call_2");
    });
  });

  // --- stream ---

  describe("stream", () => {
    const fakeTextEvents: ChatStreamEvent[] = [
      { type: "text", text: "Hi" },
      { type: "done", finish_reason: "stop", usage: { input_tokens: 0, output_tokens: 5 } },
    ];

    function makeFakeStream(events: ChatStreamEvent[] = fakeTextEvents) {
      return (async function* () {
        for (const e of events) yield e;
      })();
    }

    it("should delegate to provider.stream with correct params", async () => {
      mockStream.mockReturnValue(makeFakeStream());
      const agent = createAgent({ model: mockProvider });

      for await (const _ of agent.stream(USER_MESSAGE)) {
        // consume
      }

      expect(mockStream).toHaveBeenCalledWith({
        messages: USER_MESSAGE,
      });
    });

    it("should yield events from provider stream", async () => {
      mockStream.mockReturnValue(makeFakeStream());
      const agent = createAgent({ model: mockProvider });

      const events: ChatStreamEvent[] = [];
      for await (const event of agent.stream(USER_MESSAGE)) {
        events.push(event);
      }

      expect(events).toEqual(fakeTextEvents);
    });

    it("should pass tool definitions to stream", async () => {
      mockStream.mockReturnValue(makeFakeStream());
      const greetTool = tool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }) => `Hi ${name}`,
      });

      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool],
        sandbox: mockSandbox,
      });

      for await (const _ of agent.stream(USER_MESSAGE)) {
        // consume
      }

      const call = mockStream.mock.calls[0][0];
      expect(call.tools).toEqual([greetTool.toToolDefinition()]);
    });

    it("should execute tool calls and loop in stream", async () => {
      const greetTool = tool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }) => `Hello, ${name}!`,
      });

      // First stream: tool call
      const toolCallEvents: ChatStreamEvent[] = [
        { type: "tool_call_start", id: "call_1", name: "greet" },
        { type: "tool_call_delta", id: "call_1", arguments: '{"name":' },
        { type: "tool_call_delta", id: "call_1", arguments: '"Alice"}' },
        { type: "tool_call_end", id: "call_1" },
        { type: "done", finish_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 20 } },
      ];

      // Second stream: final text
      const finalEvents: ChatStreamEvent[] = [
        { type: "text", text: "Done!" },
        { type: "done", finish_reason: "stop", usage: { input_tokens: 30, output_tokens: 5 } },
      ];

      mockStream
        .mockReturnValueOnce(makeFakeStream(toolCallEvents))
        .mockReturnValueOnce(makeFakeStream(finalEvents));

      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool],
        sandbox: mockSandbox,
      });

      const events: ChatStreamEvent[] = [];
      for await (const event of agent.stream(USER_MESSAGE)) {
        events.push(event);
      }

      // Should have: tool_call events + tool_result + done(tool_use) + text + done(stop)
      expect(events.some((e) => e.type === "tool_result")).toBe(true);
      const toolResult = events.find((e) => e.type === "tool_result")!;
      expect(toolResult).toEqual({
        type: "tool_result",
        id: "call_1",
        name: "greet",
        output: "Hello, Alice!",
      });

      // Final text event
      expect(events.some((e) => e.type === "text" && e.text === "Done!")).toBe(true);

      // Provider.stream called twice
      expect(mockStream).toHaveBeenCalledTimes(2);

      // Second call should have assistant + tool messages
      const secondCall = mockStream.mock.calls[1][0];
      const msgs = secondCall.messages as MessageParam[];
      expect(msgs[1]).toEqual({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "greet", arguments: '{"name":"Alice"}' } },
        ],
      });
      expect(msgs[2]).toEqual({
        role: "tool",
        tool_call_id: "call_1",
        content: "Hello, Alice!",
      });
    });

    it("should handle multiple tool calls in stream", async () => {
      const echoTool = tool({
        name: "echo",
        description: "Echo",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }) => text,
      });

      const multiToolEvents: ChatStreamEvent[] = [
        { type: "tool_call_start", id: "c1", name: "echo" },
        { type: "tool_call_delta", id: "c1", arguments: '{"text":"a"}' },
        { type: "tool_call_end", id: "c1" },
        { type: "tool_call_start", id: "c2", name: "echo" },
        { type: "tool_call_delta", id: "c2", arguments: '{"text":"b"}' },
        { type: "tool_call_end", id: "c2" },
        { type: "done", finish_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 10 } },
      ];

      mockStream
        .mockReturnValueOnce(makeFakeStream(multiToolEvents))
        .mockReturnValueOnce(makeFakeStream());

      const agent = createAgent({
        model: mockProvider,
        tools: [echoTool],
        sandbox: mockSandbox,
      });

      const events: ChatStreamEvent[] = [];
      for await (const event of agent.stream(USER_MESSAGE)) {
        events.push(event);
      }

      const results = events.filter((e) => e.type === "tool_result");
      expect(results).toHaveLength(2);
    });

    it("should stop stream loop at maxIterations", async () => {
      const echoTool = tool({
        name: "echo",
        description: "Echo",
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }) => text,
      });

      const toolCallEvents: ChatStreamEvent[] = [
        { type: "tool_call_start", id: "c1", name: "echo" },
        { type: "tool_call_delta", id: "c1", arguments: '{"text":"x"}' },
        { type: "tool_call_end", id: "c1" },
        { type: "done", finish_reason: "tool_use", usage: { input_tokens: 5, output_tokens: 5 } },
      ];

      // Always returns tool calls
      mockStream.mockReturnValue(makeFakeStream(toolCallEvents));

      const agent = createAgent({
        model: mockProvider,
        tools: [echoTool],
        sandbox: mockSandbox,
        maxIterations: 2,
      });

      const events: ChatStreamEvent[] = [];
      for await (const event of agent.stream(USER_MESSAGE)) {
        events.push(event);
      }

      expect(mockStream).toHaveBeenCalledTimes(2);
    });
  });
});
