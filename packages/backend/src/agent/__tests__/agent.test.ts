import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "../agent.js";
import type { LLMProvider, LLMResponse, AgentMiddleware } from "../types.js";
import type { Message, MessagePart, MessageStreamEvent, FinishReason } from "@code-artisan/shared";

// --- Mocks ---

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
vi.mock("../../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockDbSelect,
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockDbUpdate,
      }),
    }),
  },
}));

vi.mock("../../mcp/mcp-tools.js", () => ({
  McpTools: class {
    initialize = vi.fn().mockResolvedValue([]);
    cleanup = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock("../../db/schema.js", () => ({
  conversations: { id: "id", mode: "mode", sandboxId: "sandbox_id", userId: "user_id" },
  mcpServers: { userId: "user_id", serverId: "server_id" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

const storedMessages: Message[] = [];
const mockAddMessage = vi.fn().mockImplementation(async (role: string, parts: MessagePart[]) => {
  const msg: Message = {
    id: `msg_${storedMessages.length + 1}`,
    role: role as Message["role"],
    parts,
    createdAt: new Date().toISOString(),
  };
  storedMessages.push(msg);
  return { id: msg.id };
});
const mockUpdatePart = vi.fn();
const mockGetMessages = vi.fn().mockImplementation(async () => [...storedMessages]);

vi.mock("../../services/message-store.js", () => {
  return {
    MessageStore: class {
      addMessage = mockAddMessage;
      updatePart = mockUpdatePart;
      getMessages = mockGetMessages;
      getFileSnapshots = vi.fn().mockResolvedValue([]);
      upsertFileSnapshot = vi.fn();
    },
  };
});

vi.mock("../../services/event-bus.js", () => ({
  eventBus: {
    emitStream: vi.fn(),
    subscribe: vi.fn(),
  },
}));

vi.mock("../../sandbox/index.js", () => ({
  getSandboxProvider: vi.fn().mockReturnValue({
    acquire: vi.fn().mockResolvedValue({
      id: "sandbox_1",
      getHostUrl: vi.fn().mockReturnValue("https://preview.example.com"),
    }),
    restoreFiles: vi.fn(),
  }),
}));

const mockRegistry = {
  get: vi.fn().mockReturnValue({
    call: vi.fn().mockResolvedValue("tool output"),
  }),
  toToolDefinitions: vi.fn().mockReturnValue([]),
  toPromptSection: vi.fn().mockReturnValue("- bash: Execute command"),
};

vi.mock("../../tools/index.js", () => ({
  createToolRegistry: vi.fn(() => mockRegistry),
}));

// --- Helpers ---

function makeProvider(responses: LLMResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    stream: vi.fn().mockImplementation(() => {
      const response = responses[callIndex++];
      async function* gen(): AsyncGenerator<MessageStreamEvent> {
        yield { type: "step-start" };
        if (response.textContent) {
          yield { type: "text-start", id: "0" };
          yield { type: "text-delta", id: "0", delta: response.textContent };
          yield { type: "text-end", id: "0", text: response.textContent };
        }
        for (const tb of response.thinkingBlocks) {
          yield { type: "thinking-start", id: "0" };
          yield { type: "thinking-end", id: "0", text: tb.thinking, signature: tb.signature ?? "" };
        }
        for (const tc of response.toolCalls) {
          yield { type: "tool-input-start", toolCallId: tc.id, toolName: tc.name };
          yield { type: "tool-input-end", toolCallId: tc.id, toolName: tc.name, text: JSON.stringify(tc.input) };
        }
        const fr: FinishReason = response.stopReason === "tool_use" ? "tool_calls" : "stop";
        yield { type: "step-finish", finishReason: fr, usage: response.usage };
        yield { type: "stream-finish" };
      }
      return gen();
    }),
    generateText: vi.fn().mockResolvedValue("Generated Title"),
  };
}

function textResponse(text: string): LLMResponse {
  return {
    textContent: text,
    thinkingBlocks: [],
    toolCalls: [],
    stopReason: "end_turn",
    usage: { inputTokens: 10, outputTokens: 20 },
    model: "test-model",
  };
}

function toolResponse(toolCalls: Array<{ name: string; input: Record<string, unknown> }>, text = ""): LLMResponse {
  return {
    textContent: text,
    thinkingBlocks: [],
    toolCalls: toolCalls.map((tc, i) => ({ id: `toolu_${i + 1}`, ...tc })),
    stopReason: "tool_use",
    usage: { inputTokens: 15, outputTokens: 30 },
    model: "test-model",
  };
}

// --- Tests ---

describe("Agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedMessages.length = 0;
    mockDbSelect.mockResolvedValue([{ mode: "yolo", sandboxId: null, userId: "user-1" }]);
    mockDbUpdate.mockResolvedValue(undefined);
  });

  it("handles simple text response in one turn", async () => {
    const provider = makeProvider([textResponse("Hello!")]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userId: "test-user", userParts: [{ type: "text", text: "hi" }] });

    expect(mockAddMessage).toHaveBeenCalledTimes(2);
    expect(mockAddMessage.mock.calls[0][0]).toBe("user");
    expect(mockAddMessage.mock.calls[1][0]).toBe("assistant");

    const assistantParts = mockAddMessage.mock.calls[1][1] as MessagePart[];
    expect(assistantParts.some((p) => p.type === "text")).toBe(true);
    expect(assistantParts.some((p) => p.type === "step-end")).toBe(true);

    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it("handles single tool call", async () => {
    const provider = makeProvider([
      toolResponse([{ name: "bash", input: { command: "echo hi" } }], "Let me run that."),
      textResponse("Done!"),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userId: "test-user", userParts: [{ type: "text", text: "run echo" }] });

    const roles = mockAddMessage.mock.calls.map((c) => c[0]);
    expect(roles).toEqual(["user", "assistant", "tool", "assistant"]);

    const toolParts = mockAddMessage.mock.calls[2][1] as MessagePart[];
    expect(toolParts[0]).toMatchObject({ type: "tool-call", toolName: "bash" });

    expect(mockUpdatePart).toHaveBeenCalledWith(
      expect.any(String),
      0,
      expect.objectContaining({ state: "result", output: "tool output" }),
    );

    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  it("handles multiple parallel tool calls", async () => {
    const provider = makeProvider([
      toolResponse([
        { name: "write_file", input: { path: "/a.txt", content: "a" } },
        { name: "bash", input: { command: "echo done" } },
      ]),
      textResponse("All done!"),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userId: "test-user", userParts: [{ type: "text", text: "write and run" }] });

    const roles = mockAddMessage.mock.calls.map((c) => c[0]);
    expect(roles).toEqual(["user", "assistant", "tool", "tool", "assistant"]);

    expect(mockUpdatePart).toHaveBeenCalledTimes(2);
  });

  it("handles multi-turn tool loop", async () => {
    const provider = makeProvider([
      toolResponse([{ name: "write_file", input: { path: "/a.py", content: "print(1)" } }], "Writing file."),
      toolResponse([{ name: "bash", input: { command: "python /a.py" } }], "Running."),
      textResponse("Output is 1."),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userId: "test-user", userParts: [{ type: "text", text: "write and run python" }] });

    expect(provider.stream).toHaveBeenCalledTimes(3);

    const lastCall = mockAddMessage.mock.calls[mockAddMessage.mock.calls.length - 1];
    expect(lastCall[0]).toBe("assistant");
    expect((lastCall[1] as MessagePart[]).some((p) => p.type === "text" && p.text === "Output is 1.")).toBe(true);
  });

  it("respects maxIterations", async () => {
    const infiniteTools = Array(20).fill(
      toolResponse([{ name: "bash", input: { command: "loop" } }]),
    );
    const provider = makeProvider(infiniteTools);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userId: "test-user", userParts: [{ type: "text", text: "loop" }], maxIterations: 3 });

    expect(provider.stream).toHaveBeenCalledTimes(3);
  });

  it("stops when middleware sets shouldStop", async () => {
    const provider = makeProvider([
      toolResponse([{ name: "bash", input: { command: "echo 1" } }]),
      textResponse("should not reach"),
    ]);

    const stopMiddleware: AgentMiddleware = {
      name: "stop-test",
      async afterModel(runtime) {
        runtime.shouldStop = true;
      },
    };

    const agent = new Agent(provider, [stopMiddleware]);
    await agent.run({ conversationId: "conv-1", userId: "test-user", userParts: [{ type: "text", text: "test" }] });

    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it("recovers from tool execution error via Promise.allSettled", async () => {
    (mockRegistry.get as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      call: vi.fn().mockRejectedValue(new Error("sandbox crashed")),
    });

    const provider = makeProvider([
      toolResponse([{ name: "bash", input: { command: "bad" } }]),
      textResponse("Sorry, that failed."),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userId: "test-user", userParts: [{ type: "text", text: "do something" }] });

    expect(mockUpdatePart).toHaveBeenCalledWith(
      expect.any(String),
      0,
      expect.objectContaining({ state: "error", output: expect.stringContaining("sandbox crashed") }),
    );

    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  it("handles confirm mode — stops with pending approval", async () => {
    mockDbSelect.mockResolvedValue([{ mode: "confirm", sandboxId: null, userId: "user-1" }]);

    const provider = makeProvider([
      toolResponse([{ name: "bash", input: { command: "rm -rf" } }]),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userId: "test-user", userParts: [{ type: "text", text: "delete everything" }] });

    const toolCall = mockAddMessage.mock.calls.find((c) => c[0] === "tool");
    expect(toolCall).toBeDefined();

    expect(mockUpdatePart).toHaveBeenCalledWith(
      expect.any(String),
      0,
      expect.objectContaining({ approval: "pending" }),
    );

    expect(provider.stream).toHaveBeenCalledTimes(1);
  });
});
