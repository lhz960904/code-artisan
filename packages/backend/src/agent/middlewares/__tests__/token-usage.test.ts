import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenUsageMiddleware } from "../token-usage.js";
import type { AgentRuntime, LLMResponse } from "../../types.js";

// Mock quota module
vi.mock("../../../services/quota.js", () => ({
  QuotaService: vi.fn().mockImplementation(() => ({
    checkBalance: vi.fn().mockResolvedValue(true),
    addUsage: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock DB
vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ userId: "user-1" }]),
      }),
    }),
  },
}));

vi.mock("../../../db/schema.js", () => ({
  conversations: { userId: "user_id", id: "id" },
}));

function makeRuntime(overrides?: Partial<AgentRuntime>): AgentRuntime {
  return {
    conversationId: "test-conv",
    messages: [],
    shouldStop: false,
    store: { addMessage: vi.fn().mockResolvedValue({ id: "msg-1" }) },
    emitStream: vi.fn(),
    ...overrides,
  } as unknown as AgentRuntime;
}

function makeResponse(inputTokens: number, outputTokens: number): LLMResponse {
  return {
    textContent: "test",
    thinkingBlocks: [],
    toolCalls: [],
    stopReason: "end_turn",
    usage: { inputTokens, outputTokens },
    model: "test",
  };
}

describe("TokenUsageMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes quota in beforeAgent", async () => {
    const mw = new TokenUsageMiddleware();
    const runtime = makeRuntime();

    await mw.beforeAgent(runtime);

    // Should not crash, quota initialized
    // Verify by calling afterModel — if quota wasn't init'd, addUsage would fail
    await mw.afterModel(runtime, makeResponse(100, 50));
  });

  it("tracks usage in afterModel", async () => {
    const { QuotaService } = await import("../../../services/quota.js");
    const mw = new TokenUsageMiddleware();
    const runtime = makeRuntime();

    await mw.beforeAgent(runtime);
    await mw.afterModel(runtime, makeResponse(100, 50));

    const mockInstance = (QuotaService as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(mockInstance.addUsage).toHaveBeenCalledWith(100, 50);
  });

  it("stops agent when quota exceeded", async () => {
    // Override checkBalance to return false
    const { QuotaService } = await import("../../../services/quota.js");
    (QuotaService as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      checkBalance: vi.fn().mockResolvedValue(false),
      addUsage: vi.fn(),
    }));

    const mw = new TokenUsageMiddleware();
    const runtime = makeRuntime();

    await mw.beforeAgent(runtime);
    await mw.beforeModel(runtime);

    expect(runtime.shouldStop).toBe(true);
    expect(runtime.store.addMessage).toHaveBeenCalledWith(
      "assistant",
      [{ type: "error", message: "Token quota exceeded." }],
    );
  });

  it("does nothing in afterModel without response", async () => {
    const mw = new TokenUsageMiddleware();
    const runtime = makeRuntime();

    await mw.beforeAgent(runtime);
    await mw.afterModel(runtime, undefined);

    // Should not crash
    expect(runtime.shouldStop).toBe(false);
  });
});
