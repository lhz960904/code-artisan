import { describe, it, expect, beforeEach, mock } from "bun:test";
import * as z from "zod";
import { AnthropicProvider } from "./index";
import { LLMProvider } from "../../types/provider";
import type { ModelInvokeParams } from "../../types/provider";
import type { AssistantMessage, Message } from "../../types/messages";
import { defineTool } from "../../tools/tool";

const mockCreate = mock();

mock.module("@anthropic-ai/sdk", () => ({
  default: function () {
    return { messages: { create: mockCreate } };
  },
}));

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

const baseParams: ModelInvokeParams = {
  messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
};

describe("AnthropicProvider", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("should extend LLMProvider", () => {
    const provider = new AnthropicProvider(TEST_MODEL);
    expect(provider).toBeInstanceOf(LLMProvider);
  });

  describe("invoke", () => {
    it("should call client.messages.create with stream: false", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke(baseParams);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          stream: false,
        }),
        expect.anything(),
      );
    });

    it("should convert Anthropic response to AssistantMessage", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      const result = await provider.invoke(baseParams);

      expect(result).toEqual({
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
      });
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

      expect(result.content).toEqual([
        { type: "text", text: "Let me search." },
        { type: "tool_use", id: "toolu_123", name: "search", input: { query: "hello" } },
      ]);
    });

    it("should preserve signature from thinking block in response", async () => {
      const thinkingMessage = {
        ...fakeAnthropicMessage,
        content: [
          { type: "thinking", thinking: "Let me think about this...", signature: "sig_abc123" },
          { type: "text", text: "Here's my answer." },
        ],
      };
      mockCreate.mockResolvedValue(thinkingMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      const result = await provider.invoke(baseParams);

      expect(result.content).toEqual([
        { type: "thinking", thinking: "Let me think about this...", signature: "sig_abc123" },
        { type: "text", text: "Here's my answer." },
      ]);
    });

    it("should pass signature back when sending thinking blocks to Anthropic", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "reasoning...", signature: "sig_xyz789" },
              { type: "text", text: "answer" },
            ],
          },
          { role: "user", content: [{ type: "text", text: "follow up" }] },
        ],
      });

      const call = mockCreate.mock.calls[0]?.[0];
      expect(call.messages[0].content[0]).toEqual({
        type: "thinking",
        thinking: "reasoning...",
        signature: "sig_xyz789",
      });
    });

    it("should fallback to empty signature when not provided", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "reasoning..." },
              { type: "text", text: "answer" },
            ],
          },
          { role: "user", content: [{ type: "text", text: "follow up" }] },
        ],
      });

      const call = mockCreate.mock.calls[0]?.[0];
      expect(call.messages[0].content[0]).toEqual({
        type: "thinking",
        thinking: "reasoning...",
        signature: "",
      });
    });

    it("should extract system message as TextBlockParam array", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          { role: "system", content: [{ type: "text", text: "Be helpful." }] },
          { role: "user", content: [{ type: "text", text: "Hi" }] },
        ],
      });

      const call = mockCreate.mock.calls[0]?.[0];
      expect(call.system).toEqual([{ type: "text", text: "Be helpful." }]);
      expect(call.messages).toEqual([{ role: "user", content: [{ type: "text", text: "Hi" }] }]);
    });

    it("should convert tool message to Anthropic tool_result", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          { role: "user", content: [{ type: "text", text: "Hi" }] },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "toolu_1", name: "search", input: { q: "test" } }],
          },
          {
            role: "tool",
            content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "result data" }],
          },
        ],
      });

      const call = mockCreate.mock.calls[0]?.[0];
      expect(call.messages[1]).toEqual({
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_1", name: "search", input: { q: "test" } }],
      });
      expect(call.messages[2]).toEqual({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "result data" }],
      });
    });

    it("should convert image_url content part", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({
        ...baseParams,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What's this?" },
              { type: "image_url", image_url: { url: "https://example.com/img.png" } },
            ],
          },
        ],
      });

      const call = mockCreate.mock.calls[0]?.[0];
      expect(call.messages[0]).toEqual({
        role: "user",
        content: [
          { type: "text", text: "What's this?" },
          { type: "image", source: { type: "url", url: "https://example.com/img.png" } },
        ],
      });
    });

    it("should convert tools to Anthropic format", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      const weatherTool = defineTool({
        name: "get_weather",
        description: "Get the weather",
        parameters: z.object({ city: z.string() }),
        invoke: async () => "sunny",
      });

      await provider.invoke({
        ...baseParams,
        tools: [weatherTool],
      });

      const call = mockCreate.mock.calls[0]![0];
      expect(call.tools[0].name).toBe("get_weather");
      expect(call.tools[0].description).toBe("Get the weather");
      expect(call.tools[0].input_schema).toBeDefined();
    });

    it("should forward extra options", async () => {
      mockCreate.mockResolvedValue(fakeAnthropicMessage);
      const provider = new AnthropicProvider(TEST_MODEL);

      await provider.invoke({ ...baseParams, options: { temperature: 0.5 } });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 }),
        expect.anything(),
      );
    });

    it("should propagate errors", async () => {
      mockCreate.mockRejectedValue(new Error("Rate limited"));
      const provider = new AnthropicProvider(TEST_MODEL);

      await expect(provider.invoke(baseParams)).rejects.toThrow("Rate limited");
    });
  });
});
