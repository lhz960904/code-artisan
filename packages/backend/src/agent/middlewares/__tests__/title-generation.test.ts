import { describe, it, expect, vi, beforeEach } from "vitest";
import { TitleGenerationMiddleware } from "../title-generation.js";
import type { AgentRuntime } from "../../types.js";
import type { Message } from "@code-artisan/shared";

// Mock DB
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ title: null }]),
      }),
    }),
    update: () => mockUpdate(),
  },
}));

vi.mock("../../../db/schema.js", () => ({
  conversations: { title: "title", id: "id" },
}));

function msg(role: Message["role"], text: string): Message {
  return {
    id: `msg_${Date.now()}`,
    role,
    parts: [{ type: "text", text }],
    createdAt: new Date().toISOString(),
  };
}

function makeRuntime(messages: Message[], title: string | null = null): AgentRuntime {
  return {
    conversationId: "test-conv",
    messages,
    provider: {
      generateText: vi.fn().mockResolvedValue("Generated Title"),
    },
  } as unknown as AgentRuntime;
}

describe("TitleGenerationMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates title after first exchange", async () => {
    const mw = new TitleGenerationMiddleware();
    const runtime = makeRuntime([
      msg("user", "help me build a todo app"),
      msg("assistant", "Sure, I'll help you build a todo app."),
    ]);

    await mw.afterAgent(runtime);

    const params = (runtime.provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(params.messages[0].parts[0].text).toContain("todo app");
  });

  it("skips if no user message", async () => {
    const mw = new TitleGenerationMiddleware();
    const runtime = makeRuntime([
      msg("assistant", "Hello!"),
    ]);

    await mw.afterAgent(runtime);

    expect(runtime.provider.generateText).not.toHaveBeenCalled();
  });

  it("does not crash on generateText failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mw = new TitleGenerationMiddleware();
    const runtime = makeRuntime([
      msg("user", "test"),
    ]);
    (runtime.provider.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("API down"));

    // Should not throw
    await mw.afterAgent(runtime);

    consoleSpy.mockRestore();
  });
});
