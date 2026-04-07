import { describe, it, expect, beforeEach, mock } from "bun:test";
import * as z from "zod";
import { createAgent } from "./agent";
import { defineTool } from "../tools/tool";
import type { Message, AssistantMessage, StreamEvent } from "../types/messages";
import { BaseProvider } from "../types/provider/base";
import type { Sandbox } from "../sandbox/base";

const mockInvoke = mock();
const mockStream = mock();

const mockProvider = {
  invoke: mockInvoke,
  stream: mockStream,
} as unknown as BaseProvider;

const mockSandbox = {
  id: "mock",
  exec: mock(),
  readFile: mock(),
  writeFile: mock(),
  listDir: mock(),
  glob: mock(),
  grep: mock(),
  close: mock(),
} as unknown as Sandbox;

const USER_MESSAGE: Message[] = [{ role: "user", content: [{ type: "text", text: "Hello" }] }];

const fakeResponse: AssistantMessage = {
  role: "assistant",
  content: [{ type: "text", text: "Hi!" }],
};

describe("createAgent", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockStream.mockReset();
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
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 2048,
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
    const greetTool = defineTool({
      name: "greet",
      description: "Greet someone",
      parameters: z.object({ name: z.string() }),
      invoke: async ({ name }) => `Hello, ${name}!`,
    });

    it("should pass tool definitions to provider", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool],
        sandbox: mockSandbox,
      });

      await agent.invoke(USER_MESSAGE);

      const call = mockInvoke.mock.calls[0]?.[0];
      expect(call.tools).toBeDefined();
      expect(call.tools[0].name).toBe("greet");
    });

    it("should execute tool calls and loop", async () => {
      // First response: model calls tool
      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "greet", input: { name: "Alice" } },
        ],
      };

      // Second response: model returns final answer
      const finalResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "I greeted Alice for you!" }],
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

      expect(mockInvoke).toHaveBeenCalledTimes(2);

      // Second call should include assistant + tool messages
      const secondCall = mockInvoke.mock.calls[1]?.[0];
      const messages = secondCall.messages as Message[];

      expect(messages[0]).toEqual(USER_MESSAGE[0]);

      // Assistant message with tool_use
      expect(messages[1]).toEqual(toolCallResponse);

      // Tool result
      expect(messages[2]).toEqual({
        role: "tool",
        content: [{ type: "tool_result", tool_use_id: "call_1", content: "Hello, Alice!" }],
      });

      // Final result
      const text = result.content.find((c) => c.type === "text");
      expect(text?.type === "text" && text.text).toBe("I greeted Alice for you!");
    });

    it("should handle tool execution errors gracefully", async () => {
      const failTool = defineTool({
        name: "fail",
        description: "Always fails",
        parameters: z.object({}),
        invoke: async () => {
          throw new Error("boom");
        },
      });

      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "fail", input: {} },
        ],
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

      expect(mockInvoke).toHaveBeenCalledTimes(2);
      const messages = mockInvoke.mock.calls[1]?.[0]?.messages as Message[];
      const toolMsg = messages[2] as any;
      expect(toolMsg.content[0].content).toContain("boom");
    });

    it("should handle unknown tool name", async () => {
      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "nonexistent", input: {} },
        ],
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

      const messages = mockInvoke.mock.calls[1]?.[0]?.messages as Message[];
      const toolMsg = messages[2] as any;
      expect(toolMsg.content[0].content).toContain("nonexistent");
      expect(toolMsg.content[0].content).toContain("not found");
    });

    it("should stop after maxIterations", async () => {
      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "greet", input: { name: "Bob" } },
        ],
      };

      mockInvoke.mockResolvedValue(toolCallResponse);

      const agent = createAgent({
        model: mockProvider,
        tools: [greetTool],
        sandbox: mockSandbox,
        maxIterations: 3,
      });

      const result = await agent.invoke(USER_MESSAGE);

      expect(mockInvoke).toHaveBeenCalledTimes(3);
      expect(result).toBe(toolCallResponse);
    });

    it("should handle multiple tool calls in one response", async () => {
      const echoTool = defineTool({
        name: "echo",
        description: "Echo input",
        parameters: z.object({ text: z.string() }),
        invoke: async ({ text }) => text,
      });

      const multiToolResponse: AssistantMessage = {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "greet", input: { name: "A" } },
          { type: "tool_use", id: "call_2", name: "echo", input: { text: "hi" } },
        ],
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

      const messages = mockInvoke.mock.calls[1]?.[0]?.messages as Message[];
      // user + assistant + tool_result_1 + tool_result_2 = 4
      expect(messages).toHaveLength(4);
      expect((messages[2] as any).content[0].tool_use_id).toBe("call_1");
      expect((messages[3] as any).content[0].tool_use_id).toBe("call_2");
    });
  });

  // --- stream ---

  describe("stream", () => {
    const fakeTextEvents: StreamEvent[] = [
      { type: "text", text: "Hi" },
      { type: "done", finish_reason: "stop", usage: { input_tokens: 0, output_tokens: 5 } },
    ];

    function makeFakeStream(events: StreamEvent[] = fakeTextEvents) {
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

      const events: StreamEvent[] = [];
      for await (const event of agent.stream(USER_MESSAGE)) {
        events.push(event);
      }

      expect(events).toEqual(fakeTextEvents);
    });

    it("should execute tool calls and loop in stream", async () => {
      const greetTool = defineTool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hello, ${name}!`,
      });

      const toolCallEvents: StreamEvent[] = [
        { type: "tool_call_start", id: "call_1", name: "greet" },
        { type: "tool_call_delta", id: "call_1", arguments: '{"name":' },
        { type: "tool_call_delta", id: "call_1", arguments: '"Alice"}' },
        { type: "tool_call_end", id: "call_1" },
        { type: "done", finish_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 20 } },
      ];

      const finalEvents: StreamEvent[] = [
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

      const events: StreamEvent[] = [];
      for await (const event of agent.stream(USER_MESSAGE)) {
        events.push(event);
      }

      expect(events.some((e) => e.type === "tool_result")).toBe(true);
      const toolResult = events.find((e) => e.type === "tool_result")!;
      expect(toolResult).toEqual({
        type: "tool_result",
        id: "call_1",
        name: "greet",
        output: "Hello, Alice!",
      });

      expect(events.some((e) => e.type === "text" && e.text === "Done!")).toBe(true);
      expect(mockStream).toHaveBeenCalledTimes(2);
    });

    it("should stop stream loop at maxIterations", async () => {
      const echoTool = defineTool({
        name: "echo",
        description: "Echo",
        parameters: z.object({ text: z.string() }),
        invoke: async ({ text }) => text,
      });

      const toolCallEvents: StreamEvent[] = [
        { type: "tool_call_start", id: "c1", name: "echo" },
        { type: "tool_call_delta", id: "c1", arguments: '{"text":"x"}' },
        { type: "tool_call_end", id: "c1" },
        { type: "done", finish_reason: "tool_use", usage: { input_tokens: 5, output_tokens: 5 } },
      ];

      mockStream.mockReturnValue(makeFakeStream(toolCallEvents));

      const agent = createAgent({
        model: mockProvider,
        tools: [echoTool],
        sandbox: mockSandbox,
        maxIterations: 2,
      });

      const events: StreamEvent[] = [];
      for await (const event of agent.stream(USER_MESSAGE)) {
        events.push(event);
      }

      expect(mockStream).toHaveBeenCalledTimes(2);
    });
  });
});
