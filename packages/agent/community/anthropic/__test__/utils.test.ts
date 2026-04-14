import { describe, it, expect } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicStreamAccumulator } from "../utils";

type RawEvent = Anthropic.RawMessageStreamEvent;

function feed(events: RawEvent[]): ReturnType<AnthropicStreamAccumulator["snapshot"]> {
  const acc = new AnthropicStreamAccumulator();
  for (const e of events) acc.apply(e);
  return acc.snapshot();
}

describe("AnthropicStreamAccumulator", () => {
  it("accumulates text deltas into a single text block", () => {
    const snap = feed([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "", citations: [] } as unknown as Anthropic.TextBlock,
      },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo!" } },
    ]);
    expect(snap.content).toEqual([{ type: "text", text: "Hello!" }]);
  });

  it("accumulates thinking and signature deltas", () => {
    const snap = feed([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "", signature: "" } as unknown as Anthropic.ThinkingBlock,
      },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "step " } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "one" } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
    ]);
    expect(snap.content).toEqual([
      { type: "thinking", thinking: "step one", signature: "sig" },
    ]);
  });

  it("falls back to {} while tool_use input JSON is partial, then parses when complete", () => {
    const acc = new AnthropicStreamAccumulator();
    acc.apply({
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: "t1",
        name: "greet",
        input: {},
      } as unknown as Anthropic.ToolUseBlock,
    });
    acc.apply({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"nam' },
    });
    const midSnap = acc.snapshot();
    expect(midSnap.content[0]).toMatchObject({ type: "tool_use", id: "t1", input: {} });

    acc.apply({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: 'e":"Alice"}' },
    });
    const finalSnap = acc.snapshot();
    expect(finalSnap.content[0]).toMatchObject({
      type: "tool_use",
      id: "t1",
      name: "greet",
      input: { name: "Alice" },
    });
  });

  it("indexes mixed blocks independently (text, tool_use, text)", () => {
    const snap = feed([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" } as unknown as Anthropic.TextBlock,
      },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "pre" } },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "t1", name: "run", input: {} } as unknown as Anthropic.ToolUseBlock,
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"x":1}' },
      },
      {
        type: "content_block_start",
        index: 2,
        content_block: { type: "text", text: "" } as unknown as Anthropic.TextBlock,
      },
      { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "post" } },
    ]);
    expect(snap.content).toEqual([
      { type: "text", text: "pre" },
      { type: "tool_use", id: "t1", name: "run", input: { x: 1 } },
      { type: "text", text: "post" },
    ]);
  });

  it("captures usage from message_start and updates output_tokens on message_delta", () => {
    const snap = feed([
      {
        type: "message_start",
        message: {
          id: "m1",
          role: "assistant",
          content: [],
          model: "claude",
          stop_reason: null,
          stop_sequence: null,
          type: "message",
          usage: { input_tokens: 10, output_tokens: 1 },
        } as unknown as Anthropic.Message,
      },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 7 } as unknown as Anthropic.MessageDeltaUsage,
      },
    ]);
    expect(snap.usage).toEqual({ inputTokens: 10, outputTokens: 7 });
  });

  it("keeps input as {} when JSON never becomes well-formed", () => {
    const snap = feed([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "run", input: {} } as unknown as Anthropic.ToolUseBlock,
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"broken"' },
      },
    ]);
    expect(snap.content[0]).toMatchObject({ type: "tool_use", input: {} });
  });

  it("snapshot returns independent copies (mutation-safe)", () => {
    const acc = new AnthropicStreamAccumulator();
    acc.apply({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" } as unknown as Anthropic.TextBlock,
    });
    acc.apply({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "a" } });
    const s1 = acc.snapshot();
    acc.apply({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "b" } });
    const s2 = acc.snapshot();
    expect(s1.content[0]).toEqual({ type: "text", text: "a" });
    expect(s2.content[0]).toEqual({ type: "text", text: "ab" });
  });
});
