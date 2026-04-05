import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicProvider } from "./index";
import { BaseProvider } from "../base";
import type { BaseInvokeParams, ChatResponse, ChatStreamEvent } from "../base";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn(() => ({
    messages: { create: mockCreate },
  }));
  return { Anthropic: MockAnthropic };
});

// Anthropic SDK raw response shape
const fakeAnthropicMessage = {
  id: "msg_123",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello!" }],
  model: "claude-sonnet-4-20250514",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
};

const TEST_MODEL = "claude-sonnet-4-20250514";

const baseParams: BaseInvokeParams = {
  messages: [{ role: "user", content: "Hi" }],
  max_tokens: 4096,
};

describe("AnthropicProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should extend BaseProvider", () => {
    const provider = new AnthropicProvider(TEST_MODEL);
    expect(provider).toBeInstanceOf(BaseProvider);
  });

  // --- invoke ---

  describe("invoke", () => {
    it("should call client.messages.create with stream: false", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke(baseParams);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          stream: false,
        }),
      );
    });

    it("should convert Anthropic response to ChatResponse", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      const result = await provider.invoke(baseParams);

      expect(result).toEqual({
        id: "msg_123",
        content: "Hello!",
        thinking: null,
        tool_calls: [],
        finish_reason: "stop",
        usage: { input_tokens: 10, output_tokens: 5 },
      } satisfies ChatResponse);
    });

    it("should convert tool_use response", async () => {
      const toolUseMessage = {
        ...fakeAnthropicMessage,
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Let me search." },
          {
            type: "tool_use",
            id: "toolu_123",
            name: "search",
            input: { query: "hello" },
          },
        ],
      };
      mockCreate.mockResolvedValue(toolUseMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      const result = await provider.invoke(baseParams);

      expect(result.thinking).toBeNull();
      expect(result.content).toBe("Let me search.");
      expect(result.tool_calls).toEqual([
        {
          id: "toolu_123",
          type: "function",
          function: {
            name: "search",
            arguments: '{"query":"hello"}',
          },
        },
      ]);
      expect(result.finish_reason).toBe("tool_use");
    });

    it("should convert thinking block in response", async () => {
      const thinkingMessage = {
        ...fakeAnthropicMessage,
        content: [
          { type: "thinking", thinking: "Let me think about this..." },
          { type: "text", text: "Here's my answer." },
        ],
      };
      mockCreate.mockResolvedValue(thinkingMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      const result = await provider.invoke(baseParams);

      expect(result.thinking).toBe("Let me think about this...");
      expect(result.content).toBe("Here's my answer.");
    });

    it("should extract system message from messages", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          { role: "system", content: "Be helpful." },
          { role: "user", content: "Hi" },
        ],
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.system).toBe("Be helpful.");
      // system message should NOT appear in messages array
      expect(call.messages).toEqual([{ role: "user", content: "Hi" }]);
    });

    it("should convert tool message to Anthropic tool_result", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          { role: "user", content: "Hi" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "toolu_1",
                type: "function" as const,
                function: { name: "search", arguments: '{"q":"test"}' },
              },
            ],
          },
          { role: "tool", tool_call_id: "toolu_1", content: "result data" },
        ],
      });

      const call = mockCreate.mock.calls[0][0];
      // assistant message should have tool_use block
      expect(call.messages[1]).toEqual({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "search",
            input: { q: "test" },
          },
        ],
      });
      // tool message should become user with tool_result
      expect(call.messages[2]).toEqual({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: "result data",
          },
        ],
      });
    });

    it("should convert image url content part", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What's this?" },
              { type: "image", source: { type: "url", url: "https://example.com/img.png" } },
            ],
          },
        ],
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.messages[0]).toEqual({
        role: "user",
        content: [
          { type: "text", text: "What's this?" },
          { type: "image", source: { type: "url", url: "https://example.com/img.png" } },
        ],
      });
    });

    it("should convert image base64 content part", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: "abc123" } },
            ],
          },
        ],
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.messages[0]).toEqual({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "abc123" } },
        ],
      });
    });

    it("should convert document content part", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: "pdf-data" } },
            ],
          },
        ],
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.messages[0]).toEqual({
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: "pdf-data" } },
        ],
      });
    });

    it("should convert tools to Anthropic format", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get the weather",
              parameters: { type: "object", properties: { city: { type: "string" } } },
            },
          },
        ],
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.tools).toEqual([
        {
          name: "get_weather",
          description: "Get the weather",
          input_schema: { type: "object", properties: { city: { type: "string" } } },
        },
      ]);
    });

    it("should return null content when response has only tool_use", async () => {
      const toolOnlyMessage = {
        ...fakeAnthropicMessage,
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "toolu_1", name: "search", input: { q: "test" } },
        ],
      };
      mockCreate.mockResolvedValue(toolOnlyMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      const result = await provider.invoke(baseParams);

      expect(result.content).toBeNull();
      expect(result.tool_calls).toHaveLength(1);
    });

    it("should forward extra params", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({ ...baseParams, temperature: 0.5 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 }),
      );
    });

    it("should propagate errors", async () => {
      mockCreate.mockRejectedValue(new Error("Rate limited"));
      const provider = new AnthropicProvider(TEST_MODEL);

      await expect(provider.invoke(baseParams)).rejects.toThrow("Rate limited");
    });
  });

  // --- stream ---

  describe("stream", () => {
    it("should convert Anthropic stream events to ChatStreamEvents", async () => {
      const fakeAnthropicEvents = [
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hi" },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: 5 },
        },
      ];
      const fakeAsyncIter = (async function* () {
        for (const e of fakeAnthropicEvents) yield e;
      })();
      mockCreate.mockResolvedValue(fakeAsyncIter);
      const provider = new AnthropicProvider(TEST_MODEL);

      const events: ChatStreamEvent[] = [];
      for await (const event of provider.stream(baseParams)) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: "text", text: "Hi" },
        { type: "done", finish_reason: "stop", usage: { input_tokens: 0, output_tokens: 5 } },
      ]);
    });

    it("should convert tool_use stream events", async () => {
      const fakeAnthropicEvents = [
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu_1", name: "search" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"q":' },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '"hi"}' },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "tool_use" },
          usage: { output_tokens: 10 },
        },
      ];
      const fakeAsyncIter = (async function* () {
        for (const e of fakeAnthropicEvents) yield e;
      })();
      mockCreate.mockResolvedValue(fakeAsyncIter);
      const provider = new AnthropicProvider(TEST_MODEL);

      const events: ChatStreamEvent[] = [];
      for await (const event of provider.stream(baseParams)) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: "tool_call_start", id: "toolu_1", name: "search" },
        { type: "tool_call_delta", id: "toolu_1", arguments: '{"q":' },
        { type: "tool_call_delta", id: "toolu_1", arguments: '"hi"}' },
        { type: "tool_call_end", id: "toolu_1" },
        { type: "done", finish_reason: "tool_use", usage: { input_tokens: 0, output_tokens: 10 } },
      ]);
    });

    it("should convert thinking stream events", async () => {
      const fakeAnthropicEvents = [
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "Hmm..." },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "content_block_start",
          index: 1,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          index: 1,
          delta: { type: "text_delta", text: "Answer" },
        },
        { type: "content_block_stop", index: 1 },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: 15 },
        },
      ];
      const fakeAsyncIter = (async function* () {
        for (const e of fakeAnthropicEvents) yield e;
      })();
      mockCreate.mockResolvedValue(fakeAsyncIter);
      const provider = new AnthropicProvider(TEST_MODEL);

      const events: ChatStreamEvent[] = [];
      for await (const event of provider.stream(baseParams)) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: "thinking", text: "Hmm..." },
        { type: "text", text: "Answer" },
        { type: "done", finish_reason: "stop", usage: { input_tokens: 0, output_tokens: 15 } },
      ]);
    });

    it("should call client.messages.create with stream: true", async () => {
      const fakeAsyncIter = (async function* () {})();
      mockCreate.mockResolvedValue(fakeAsyncIter);
      const provider = new AnthropicProvider(TEST_MODEL);

      for await (const _ of provider.stream(baseParams)) {
        // consume
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true }),
      );
    });

    it("should forward extra params", async () => {
      const fakeAsyncIter = (async function* () {})();
      mockCreate.mockResolvedValue(fakeAsyncIter);
      const provider = new AnthropicProvider(TEST_MODEL);

      for await (const _ of provider.stream({ ...baseParams, temperature: 0.3 })) {
        // consume
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.3, stream: true }),
      );
    });
  });
});
