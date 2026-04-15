import { describe, it, expect, beforeEach, mock } from "bun:test";
import * as z from "zod";
import { Agent } from "../agent";
import { defineTool } from "../../tools/tool";
import type { AssistantMessage, ToolMessage, UserMessage, NonSystemMessage } from "../../types/messages";
import type { ModelInvokeParams } from "../../types/provider";
import { LLMProvider } from "../../types/provider";

const mockInvoke = mock();

/**
 * Derive a one-shot stream from `invoke`: await the full response, then
 * yield it a single snapshot. Enough for tests that don't exercise
 * partial-snapshot semantics.
 */
async function* mockStream(params: ModelInvokeParams): AsyncGenerator<AssistantMessage> {
  const msg = (await mockInvoke(params)) as AssistantMessage;
  yield msg;
}

const mockProvider = {
  invoke: mockInvoke,
  stream: mockStream,
} as unknown as LLMProvider;

const userMessage: UserMessage = { role: "user", content: [{ type: "text", text: "Hello" }] };

const fakeResponse: AssistantMessage = {
  role: "assistant",
  content: [{ type: "text", text: "Hi!" }],
};

async function collectMessages(
  source: Promise<Array<AssistantMessage | ToolMessage>>,
): Promise<NonSystemMessage[]> {
  return await source;
}

describe("Agent", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("should have an invoke method", () => {
    const agent = new Agent({ prompt: "test", model: mockProvider });
    expect(typeof agent.invoke).toBe("function");
  });

  // --- invoke without tools ---

  describe("invoke (no tools)", () => {
    it("should prepend system prompt before conversation messages", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = new Agent({ prompt: "You are helpful", model: mockProvider });

      await collectMessages(agent.invoke(userMessage));

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const call = mockInvoke.mock.calls[0]?.[0] as ModelInvokeParams;
      expect(call.messages[0]).toEqual({
        role: "system",
        content: [{ type: "text", text: "You are helpful" }],
      });
      expect(call.messages[1]).toEqual(userMessage);
    });

    it("should yield a single assistant message", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = new Agent({ prompt: "", model: mockProvider });

      const messages = await collectMessages(agent.invoke(userMessage));

      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe(fakeResponse);
    });

    it("should call provider with messages and signal", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = new Agent({ prompt: "", model: mockProvider });

      await collectMessages(agent.invoke(userMessage));

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const call = mockInvoke.mock.calls[0]?.[0] as ModelInvokeParams;
      // Agent appends userMessage to internal history before calling provider
      expect(call.messages[0]).toEqual(userMessage);
      expect(call.signal).toBeDefined();
    });

    it("should propagate provider errors", async () => {
      mockInvoke.mockRejectedValue(new Error("Provider Error"));
      const agent = new Agent({ prompt: "", model: mockProvider });

      await expect(collectMessages(agent.invoke(userMessage))).rejects.toThrow("Provider Error");
    });

    it("should throw if invoked while already running", async () => {
      let resolveProvider!: (v: AssistantMessage) => void;
      mockInvoke.mockImplementation(
        () =>
          new Promise((r) => {
            resolveProvider = r;
          }),
      );
      const agent = new Agent({ prompt: "", model: mockProvider });

      const gen = agent.stream(userMessage);
      // Start consuming — enters the generator body and sets _running
      const pending = gen.next();

      // Wait a tick for the generator to reach the await
      await new Promise((r) => setTimeout(r, 0));

      const gen2 = agent.stream(userMessage);
      await expect(gen2.next()).rejects.toThrow("already running");

      // Resolve to clean up
      resolveProvider(fakeResponse);
      await pending;
      // drain the first stream so it terminates cleanly
      for await (const _ of gen) void _;
    });
  });

  // --- streaming semantics ---

  describe("stream()", () => {
    function makeSnapshotProvider(snapshots: AssistantMessage[]) {
      const streamMock = mock(async function* () {
        for (const s of snapshots) yield s;
      });
      return {
        provider: { invoke: mockInvoke, stream: streamMock } as unknown as LLMProvider,
        streamMock,
      };
    }

    it("defaults to mode: 'token' — yields partials and a final message", async () => {
      const { provider } = makeSnapshotProvider([
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi!" }] },
      ]);
      const agent = new Agent({ prompt: "", model: provider });

      const events: Array<{ type: string; text?: string }> = [];
      for await (const e of agent.stream(userMessage)) {
        const first = e.message.role === "assistant" ? e.message.content[0] : undefined;
        events.push({ type: e.type, text: first?.type === "text" ? first.text : "" });
      }

      expect(events).toEqual([
        { type: "partial", text: "Hi" },
        { type: "partial", text: "Hi!" },
        { type: "message", text: "Hi!" },
      ]);
    });

    it("mode: 'message' — suppresses partials, emits message events only", async () => {
      const { provider, streamMock } = makeSnapshotProvider([
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi!" }] },
      ]);
      const agent = new Agent({ prompt: "", model: provider });

      const events: Array<{ type: string }> = [];
      for await (const e of agent.stream(userMessage, { mode: "message" })) {
        events.push({ type: e.type });
      }

      // Still calls provider.stream (message mode is a consumer-side filter)
      expect(streamMock).toHaveBeenCalledTimes(1);
      expect(events).toEqual([{ type: "message" }]);
    });

    it("invoke() returns a Promise<Message[]> by draining stream(mode: 'message')", async () => {
      const { provider } = makeSnapshotProvider([
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
        fakeResponse,
      ]);
      const agent = new Agent({ prompt: "", model: provider });

      const result = await agent.invoke(userMessage);

      // Only the final (last) snapshot is collected as the assistant message.
      expect(result).toEqual([fakeResponse]);
    });
  });

  // --- abort (backend / external stop) ---

  describe("abort API", () => {
    it("abort() is a no-op when idle", () => {
      const agent = new Agent({ prompt: "", model: mockProvider });
      expect(() => agent.abort()).not.toThrow();
    });

    it("abort() aborts the in-flight provider stream with the given reason", async () => {
      let captured: AbortSignal | undefined;
      const stream = mock(async function* (params: ModelInvokeParams) {
        captured = params.signal;
        await new Promise<void>((_, reject) => {
          const s = params.signal;
          if (!s) return reject(new Error("missing signal"));
          s.addEventListener("abort", () => reject(s.reason), { once: true });
        });
        yield fakeResponse;
      });
      const provider = { invoke: mockInvoke, stream } as unknown as LLMProvider;
      const agent = new Agent({ prompt: "", model: provider });

      const iter = agent.stream(userMessage);
      const done = iter.next();

      await new Promise((r) => setTimeout(r, 0));
      expect(captured).toBeDefined();

      agent.abort("backend-stop");
      await expect(done).rejects.toBe("backend-stop");
    });

    it("abort() after a completed stream does not throw", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = new Agent({ prompt: "", model: mockProvider });
      for await (const _ of agent.stream(userMessage, { mode: "message" })) void _;
      expect(() => agent.abort()).not.toThrow();
    });
  });

  // --- invoke with tools ---

  describe("invoke (with tools)", () => {
    const greetTool = defineTool({
      name: "greet",
      description: "Greet someone",
      parameters: z.object({ name: z.string() }),
      invoke: async ({ name }) => `Hello, ${name}!`,
    });

    it("should pass tool definitions to provider", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
      });

      await collectMessages(agent.invoke(userMessage));

      const call = mockInvoke.mock.calls[0]?.[0] as ModelInvokeParams;
      expect(call.tools).toBeDefined();
      expect(call.tools?.[0]?.name).toBe("greet");
    });

    it("should pass ToolContext with signal to tools", async () => {
      let receivedSignal: AbortSignal | undefined;
      const spyTool = defineTool({
        name: "spy",
        description: "Spy on context",
        parameters: z.object({}),
        invoke: async (_input, ctx) => {
          receivedSignal = ctx.signal;
          return "ok";
        },
      });

      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "call_1", name: "spy", input: {} }],
      };
      mockInvoke.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(fakeResponse);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [spyTool],
      });

      await collectMessages(agent.invoke(userMessage));
      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it("should execute tool calls and loop", async () => {
      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "call_1", name: "greet", input: { name: "Alice" } }],
      };

      const finalResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "I greeted Alice for you!" }],
      };

      mockInvoke.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(finalResponse);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
      });

      const messages = await collectMessages(agent.invoke(userMessage));

      // Should yield: assistant (tool_use) → tool_result → assistant (final)
      expect(messages).toHaveLength(3);
      expect(messages[0]).toBe(toolCallResponse);
      expect(messages[1]).toEqual({
        role: "tool",
        content: [{ type: "tool_result", tool_use_id: "call_1", content: "Hello, Alice!" }],
      });
      expect(messages[2]).toBe(finalResponse);
      expect(mockInvoke).toHaveBeenCalledTimes(2);
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
        content: [{ type: "tool_use", id: "call_1", name: "fail", input: {} }],
      };

      mockInvoke.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(fakeResponse);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [failTool],
      });

      const messages = await collectMessages(agent.invoke(userMessage));

      const toolMsg = messages[1] as ToolMessage;
      expect(toolMsg.content[0]?.content).toContain("boom");
    });

    it("should handle unknown tool name", async () => {
      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "call_1", name: "nonexistent", input: {} }],
      };

      mockInvoke.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(fakeResponse);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
      });

      const messages = await collectMessages(agent.invoke(userMessage));

      const toolMsg = messages[1] as ToolMessage;
      expect(toolMsg.content[0]?.content).toContain("nonexistent");
      expect(toolMsg.content[0]?.content).toContain("not found");
    });

    it("should throw after maxSteps", async () => {
      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "call_1", name: "greet", input: { name: "Bob" } }],
      };

      mockInvoke.mockResolvedValue(toolCallResponse);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
        maxSteps: 2,
      });

      await expect(collectMessages(agent.invoke(userMessage))).rejects.toThrow("Maximum number of steps");
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

      mockInvoke.mockResolvedValueOnce(multiToolResponse).mockResolvedValueOnce(fakeResponse);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool, echoTool],
      });

      const messages = await collectMessages(agent.invoke(userMessage));

      // assistant + 2 tool results + final assistant
      expect(messages).toHaveLength(4);
      expect(messages[0]).toBe(multiToolResponse);

      const toolResults = messages.filter((m): m is ToolMessage => m.role === "tool");
      expect(toolResults).toHaveLength(2);
      const ids = toolResults.map((m) => m.content[0]?.tool_use_id);
      expect(ids).toContain("call_1");
      expect(ids).toContain("call_2");
    });
  });

  // --- middleware ---

  describe("middleware", () => {
    it("should call beforeAgentRun and afterAgentRun", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const beforeAgentRun = mock(() => Promise.resolve());
      const afterAgentRun = mock(() => Promise.resolve());

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        middlewares: [{ beforeAgentRun, afterAgentRun }],
      });

      await collectMessages(agent.invoke(userMessage));

      expect(beforeAgentRun).toHaveBeenCalledTimes(1);
      expect(afterAgentRun).toHaveBeenCalledTimes(1);
    });

    it("should call beforeModel and afterModel on each step", async () => {
      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "greet", input: { name: "X" } }],
      };
      mockInvoke.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(fakeResponse);

      const greetTool = defineTool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hi ${name}`,
      });

      const beforeModel = mock(() => Promise.resolve());
      const afterModel = mock(() => Promise.resolve());

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
        middlewares: [{ beforeModel, afterModel }],
      });

      await collectMessages(agent.invoke(userMessage));

      expect(beforeModel).toHaveBeenCalledTimes(2);
      expect(afterModel).toHaveBeenCalledTimes(2);
    });

    it("should use modelContext.prompt modified by beforeModel", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = new Agent({
        prompt: "original prompt",
        model: mockProvider,
        middlewares: [
          {
            beforeModel: async ({ modelContext }) => ({
              prompt: modelContext.prompt + "\ninjected by middleware",
            }),
          },
        ],
      });

      await collectMessages(agent.invoke(userMessage));

      const call = mockInvoke.mock.calls[0]?.[0] as ModelInvokeParams;
      const systemMsg = call.messages[0];
      expect(systemMsg?.role).toBe("system");
      expect((systemMsg as any).content[0].text).toContain("injected by middleware");
    });

    it("should use modelContext.tools modified by beforeModel for model invocation", async () => {
      const injectedTool = defineTool({
        name: "injected",
        description: "Injected tool",
        parameters: z.object({}),
        invoke: async () => "injected result",
      });

      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        middlewares: [
          {
            beforeModel: async () => ({
              tools: [injectedTool],
            }),
          },
        ],
      });

      await collectMessages(agent.invoke(userMessage));

      const call = mockInvoke.mock.calls[0]?.[0] as ModelInvokeParams;
      expect(call.tools).toHaveLength(1);
      expect(call.tools?.[0]?.name).toBe("injected");
    });

    it("should not accumulate beforeModel modifications across steps", async () => {
      const greetTool = defineTool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hi ${name}`,
      });

      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "greet", input: { name: "X" } }],
      };
      mockInvoke.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(fakeResponse);

      const agent = new Agent({
        prompt: "base prompt",
        model: mockProvider,
        tools: [greetTool],
        middlewares: [
          {
            beforeModel: async ({ modelContext }) => ({
              prompt: modelContext.prompt + "\n<extra>appended</extra>",
            }),
          },
        ],
      });

      await collectMessages(agent.invoke(userMessage));

      const call1 = mockInvoke.mock.calls[0]?.[0] as ModelInvokeParams;
      const call2 = mockInvoke.mock.calls[1]?.[0] as ModelInvokeParams;
      const prompt1 = (call1.messages[0] as any).content[0].text;
      const prompt2 = (call2.messages[0] as any).content[0].text;

      expect(prompt1).toBe("base prompt\n<extra>appended</extra>");
      expect(prompt2).toBe(prompt1);
    });

    it("should use agentContext.tools modified by middleware for tool lookup", async () => {
      const dynamicTool = defineTool({
        name: "dynamic",
        description: "Dynamically added",
        parameters: z.object({}),
        invoke: async () => "dynamic result",
      });

      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "dynamic", input: {} }],
      };
      mockInvoke.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(fakeResponse);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [],
        middlewares: [
          {
            beforeAgentRun: async () => ({
              tools: [dynamicTool],
            }),
          },
        ],
      });

      const messages = await collectMessages(agent.invoke(userMessage));

      const toolMsg = messages[1] as ToolMessage;
      expect(toolMsg.content[0]?.content).toBe("dynamic result");
    });

    it("should call beforeToolUse and afterToolUse", async () => {
      const greetTool = defineTool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hi ${name}`,
      });

      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "greet", input: { name: "Y" } }],
      };
      mockInvoke.mockResolvedValueOnce(toolCallResponse).mockResolvedValueOnce(fakeResponse);

      const beforeToolUse = mock(() => Promise.resolve());
      const afterToolUse = mock(() => Promise.resolve());

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
        middlewares: [{ beforeToolUse, afterToolUse }],
      });

      await collectMessages(agent.invoke(userMessage));

      expect(beforeToolUse).toHaveBeenCalledTimes(1);
      expect(afterToolUse).toHaveBeenCalledTimes(1);
    });
  });

  // --- cooperative stop ---

  describe("shouldStop", () => {
    it("should exit cleanly (no throw) when a middleware sets shouldStop after a model call", async () => {
      const greetTool = defineTool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hi ${name}`,
      });

      const toolCallResponse: AssistantMessage = {
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "greet", input: { name: "X" } }],
      };
      // The mock keeps returning tool_use indefinitely — without shouldStop,
      // the agent would loop to maxSteps and throw.
      mockInvoke.mockResolvedValue(toolCallResponse);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
        maxSteps: 10,
        middlewares: [
          {
            afterModel: async ({ agentContext }) => {
              agentContext.shouldStop = true;
            },
          },
        ],
      });

      // Should NOT throw "Maximum number of steps reached".
      const messages = await collectMessages(agent.invoke(userMessage));
      // One full step completed: assistant + tool result.
      expect(messages).toHaveLength(2);
    });

    it("should call afterAgentRun when stopping cooperatively", async () => {
      mockInvoke.mockResolvedValue({
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "greet", input: { name: "X" } }],
      } as AssistantMessage);

      const greetTool = defineTool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hi ${name}`,
      });

      const afterAgentRun = mock(() => Promise.resolve());

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
        maxSteps: 10,
        middlewares: [
          {
            afterModel: async ({ agentContext }) => {
              agentContext.shouldStop = true;
            },
            afterAgentRun,
          },
        ],
      });

      await collectMessages(agent.invoke(userMessage));

      expect(afterAgentRun).toHaveBeenCalledTimes(1);
    });

    it("should finish the current step before exiting (tool executes after shouldStop is set)", async () => {
      const toolInvoke = mock(async () => "executed");

      const testTool = defineTool({
        name: "test",
        description: "test",
        parameters: z.object({}),
        invoke: toolInvoke,
      });

      mockInvoke.mockResolvedValue({
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "test", input: {} }],
      } as AssistantMessage);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [testTool],
        maxSteps: 10,
        middlewares: [
          {
            afterModel: async ({ agentContext }) => {
              agentContext.shouldStop = true;
            },
          },
        ],
      });

      await collectMessages(agent.invoke(userMessage));

      // shouldStop was set in afterModel of step 1;
      // the tool for step 1 MUST still execute before the agent exits.
      expect(toolInvoke).toHaveBeenCalledTimes(1);
    });

    it("should still throw maxSteps error when shouldStop is never set", async () => {
      const greetTool = defineTool({
        name: "greet",
        description: "Greet",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hi ${name}`,
      });

      mockInvoke.mockResolvedValue({
        role: "assistant",
        content: [{ type: "tool_use", id: "c1", name: "greet", input: { name: "X" } }],
      } as AssistantMessage);

      const agent = new Agent({
        prompt: "",
        model: mockProvider,
        tools: [greetTool],
        maxSteps: 2,
      });

      await expect(collectMessages(agent.invoke(userMessage))).rejects.toThrow(
        "Maximum number of steps reached",
      );
    });
  });
});
