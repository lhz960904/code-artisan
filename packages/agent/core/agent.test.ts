import { describe, it, expect, beforeEach, mock } from "bun:test";
import * as z from "zod";
import { Agent } from "./agent";
import { defineTool } from "../tools/tool";
import type { AssistantMessage, ToolMessage, UserMessage, NonSystemMessage } from "../types/messages";
import type { ModelInvokeParams } from "../types/provider";
import { LLMProvider } from "../types/provider";

const mockInvoke = mock();

const mockProvider = {
  invoke: mockInvoke,
} as unknown as LLMProvider;

const userMessage: UserMessage = { role: "user", content: [{ type: "text", text: "Hello" }] };

const fakeResponse: AssistantMessage = {
  role: "assistant",
  content: [{ type: "text", text: "Hi!" }],
};

async function collectMessages(gen: AsyncGenerator<AssistantMessage | ToolMessage>): Promise<NonSystemMessage[]> {
  const messages: NonSystemMessage[] = [];
  for await (const msg of gen) {
    messages.push(msg);
  }
  return messages;
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
      mockInvoke.mockImplementation(() => new Promise((r) => { resolveProvider = r; }));
      const agent = new Agent({ prompt: "", model: mockProvider });

      const gen = agent.invoke(userMessage);
      // Start consuming — enters the generator body and sets _running
      const pending = gen.next();

      // Wait a tick for the generator to reach the await
      await new Promise((r) => setTimeout(r, 0));

      const gen2 = agent.invoke(userMessage);
      await expect(gen2.next()).rejects.toThrow("already running");

      // Resolve to clean up
      resolveProvider(fakeResponse);
      await pending;
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
});
