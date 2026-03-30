import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "../agent.js";
import type { LLMProvider, LLMResponse, AgentMiddleware } from "../types.js";
import type { Message, MessagePart } from "@code-artisan/shared";

// --- Mocks ---

// Mock DB
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
vi.mock("../../db/schema.js", () => ({
  conversations: { id: "id", mode: "mode", sandboxId: "sandbox_id", userId: "user_id" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

// Mock MessageStore
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

// Mock EventBus
vi.mock("../../services/event-bus.js", () => ({
  eventBus: {
    emitStream: vi.fn(),
    emitDone: vi.fn(),
  },
}));

// Mock Sandbox
vi.mock("../../sandbox/index.js", () => ({
  getSandboxProvider: vi.fn().mockReturnValue({
    acquire: vi.fn().mockResolvedValue({
      id: "sandbox_1",
      getHostUrl: vi.fn().mockReturnValue("https://preview.example.com"),
    }),
    restoreFiles: vi.fn(),
  }),
}));

// Mock ToolRegistry
vi.mock("../../tools/index.js", () => ({
  toolRegistry: {
    get: vi.fn().mockReturnValue({
      call: vi.fn().mockResolvedValue("tool output"),
    }),
    toToolDefinitions: vi.fn().mockReturnValue([]),
    toPromptSection: vi.fn().mockReturnValue("- bash: Execute command"),
  },
}));

// --- Helpers ---

function makeProvider(responses: LLMResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    chat: vi.fn().mockImplementation(async (_msgs, _tools, _prompt, callbacks) => {
      const response = responses[callIndex++];
      if (response.textContent) {
        callbacks.onTextDelta?.(response.textContent);
      }
      return response;
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

    await agent.run({ conversationId: "conv-1", userMessage: "hi" });

    // Should store: user msg + assistant msg
    expect(mockAddMessage).toHaveBeenCalledTimes(2);
    expect(mockAddMessage.mock.calls[0][0]).toBe("user");
    expect(mockAddMessage.mock.calls[1][0]).toBe("assistant");

    // Assistant msg should have text + step-end parts
    const assistantParts = mockAddMessage.mock.calls[1][1] as MessagePart[];
    expect(assistantParts.some((p) => p.type === "text")).toBe(true);
    expect(assistantParts.some((p) => p.type === "step-end")).toBe(true);

    // Provider called once
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it("handles single tool call", async () => {
    const provider = makeProvider([
      toolResponse([{ name: "bash", input: { command: "echo hi" } }], "Let me run that."),
      textResponse("Done!"),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userMessage: "run echo" });

    // user msg + assistant msg (text+step-end) + tool msg (call→result) + assistant msg (final)
    const roles = mockAddMessage.mock.calls.map((c) => c[0]);
    expect(roles).toEqual(["user", "assistant", "tool", "assistant"]);

    // Tool message created (state starts as "call", then updated in-place to "result")
    const toolParts = mockAddMessage.mock.calls[2][1] as MessagePart[];
    expect(toolParts[0]).toMatchObject({ type: "tool-call", toolName: "bash" });

    // Tool state updated via updatePart
    expect(mockUpdatePart).toHaveBeenCalledWith(
      expect.any(String),
      0,
      expect.objectContaining({ state: "result", output: "tool output" }),
    );

    // Provider called twice (tool response + final text)
    expect(provider.chat).toHaveBeenCalledTimes(2);
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

    await agent.run({ conversationId: "conv-1", userMessage: "write and run" });

    // user + assistant + tool1 + tool2 + assistant(final)
    const roles = mockAddMessage.mock.calls.map((c) => c[0]);
    expect(roles).toEqual(["user", "assistant", "tool", "tool", "assistant"]);

    // Both tools should be updated
    expect(mockUpdatePart).toHaveBeenCalledTimes(2);
  });

  it("handles multi-turn tool loop", async () => {
    const provider = makeProvider([
      toolResponse([{ name: "write_file", input: { path: "/a.py", content: "print(1)" } }], "Writing file."),
      toolResponse([{ name: "bash", input: { command: "python /a.py" } }], "Running."),
      textResponse("Output is 1."),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userMessage: "write and run python" });

    // Provider called 3 times
    expect(provider.chat).toHaveBeenCalledTimes(3);

    // Final message should be text
    const lastCall = mockAddMessage.mock.calls[mockAddMessage.mock.calls.length - 1];
    expect(lastCall[0]).toBe("assistant");
    expect((lastCall[1] as MessagePart[]).some((p) => p.type === "text" && p.text === "Output is 1.")).toBe(true);
  });

  it("respects maxIterations", async () => {
    // Provider always returns tool calls — should stop at maxIterations
    const infiniteTools = Array(20).fill(
      toolResponse([{ name: "bash", input: { command: "loop" } }]),
    );
    const provider = makeProvider(infiniteTools);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userMessage: "loop", maxIterations: 3 });

    // Should call provider exactly 3 times then stop
    expect(provider.chat).toHaveBeenCalledTimes(3);
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
    await agent.run({ conversationId: "conv-1", userMessage: "test" });

    // Provider called once, then stopped by middleware
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it("recovers from tool execution error via Promise.allSettled", async () => {
    // Make tool throw
    const { toolRegistry } = await import("../../tools/index.js");
    (toolRegistry.get as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      call: vi.fn().mockRejectedValue(new Error("sandbox crashed")),
    });

    const provider = makeProvider([
      toolResponse([{ name: "bash", input: { command: "bad" } }]),
      textResponse("Sorry, that failed."),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userMessage: "do something" });

    // Promise.allSettled catches rejection → tool state updated to "error"
    expect(mockUpdatePart).toHaveBeenCalledWith(
      expect.any(String),
      0,
      expect.objectContaining({ state: "error", output: expect.stringContaining("sandbox crashed") }),
    );

    // Agent continues — provider called twice (error tool result → LLM sees it → text response)
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it("handles confirm mode — stops with pending approval", async () => {
    // Return confirm mode from DB
    mockDbSelect.mockResolvedValue([{ mode: "confirm", sandboxId: null, userId: "user-1" }]);

    const provider = makeProvider([
      toolResponse([{ name: "bash", input: { command: "rm -rf" } }]),
    ]);
    const agent = new Agent(provider);

    await agent.run({ conversationId: "conv-1", userMessage: "delete everything" });

    // Tool message created with state=call
    const toolCall = mockAddMessage.mock.calls.find((c) => c[0] === "tool");
    expect(toolCall).toBeDefined();

    // Should update with approval=pending
    expect(mockUpdatePart).toHaveBeenCalledWith(
      expect.any(String),
      0,
      expect.objectContaining({ approval: "pending" }),
    );

    // Provider called only once (stopped after tool call)
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });
});
