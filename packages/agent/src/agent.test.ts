import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgent } from "./agent";
import type { MessageParam, ChatResponse, ChatStreamEvent, BaseProvider } from "./providers/base";

const mockInvoke = vi.fn();
const mockStream = vi.fn();

const mockProvider = {
  invoke: mockInvoke,
  stream: mockStream,
} as unknown as BaseProvider;

const USER_MESSAGE: MessageParam[] = [{ role: "user", content: "Hello" }];

describe("createAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return an object with invoke and stream methods", () => {
    const agent = createAgent({ model: mockProvider });
    expect(typeof agent.invoke).toBe("function");
    expect(typeof agent.stream).toBe("function");
  });

  // --- invoke ---

  describe("invoke", () => {
    const fakeResponse: ChatResponse = {
      id: "msg_123",
      content: "Hi!",
      thinking: null,
      tool_calls: [],
      finish_reason: "stop",
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    it("should delegate to provider.invoke with correct params", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = createAgent({ model: mockProvider });

      await agent.invoke(USER_MESSAGE);

      expect(mockInvoke).toHaveBeenCalledWith({
        messages: USER_MESSAGE,
        max_tokens: 4096,
      });
    });

    it("should return the provider response", async () => {
      mockInvoke.mockResolvedValue(fakeResponse);
      const agent = createAgent({ model: mockProvider });

      const result = await agent.invoke(USER_MESSAGE);

      expect(result).toBe(fakeResponse);
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

      await expect(agent.invoke(USER_MESSAGE)).rejects.toThrow(
        "Provider Error",
      );
    });
  });

  // --- stream ---

  describe("stream", () => {
    const fakeEvents: ChatStreamEvent[] = [
      { type: "text", text: "Hi" },
      { type: "done", finish_reason: "stop", usage: { input_tokens: 0, output_tokens: 5 } },
    ];

    function makeFakeStream() {
      return (async function* () {
        for (const e of fakeEvents) yield e;
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
        max_tokens: 4096,
      });
    });

    it("should yield events from provider stream", async () => {
      mockStream.mockReturnValue(makeFakeStream());
      const agent = createAgent({ model: mockProvider });

      const events: ChatStreamEvent[] = [];
      for await (const event of agent.stream(USER_MESSAGE)) {
        events.push(event);
      }

      expect(events).toEqual(fakeEvents);
    });

    it("should merge extra options", async () => {
      mockStream.mockReturnValue(makeFakeStream());
      const agent = createAgent({ model: mockProvider });

      for await (const _ of agent.stream(USER_MESSAGE, {
        temperature: 0.7,
      })) {
        // consume
      }

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.7 }),
      );
    });
  });
});
