import { describe, it, expect } from "bun:test";
import type OpenAI from "openai";
import { OpenAIStreamAccumulator, parseAssistantMessage } from "../utils";

type Chunk = OpenAI.Chat.Completions.ChatCompletionChunk;

/** Build a minimal stream chunk carrying the given delta. */
function chunk(delta: Record<string, unknown>, usage?: Chunk["usage"]): Chunk {
  return {
    id: "chatcmpl-x",
    object: "chat.completion.chunk",
    created: 0,
    model: "kimi-k2",
    choices: [
      {
        index: 0,
        delta: delta as Chunk["choices"][number]["delta"],
        finish_reason: null,
      },
    ],
    ...(usage ? { usage } : {}),
  } as Chunk;
}

function feed(chunks: Chunk[]) {
  const acc = new OpenAIStreamAccumulator();
  for (const c of chunks) acc.apply(c);
  return acc.snapshot();
}

describe("OpenAIStreamAccumulator", () => {
  it("accumulates content deltas into a single text block", () => {
    const snap = feed([
      chunk({ content: "Hel" }),
      chunk({ content: "lo " }),
      chunk({ content: "world!" }),
    ]);
    expect(snap.content).toEqual([{ type: "text", text: "Hello world!" }]);
  });

  it("accumulates reasoning_content deltas into a thinking block", () => {
    const snap = feed([
      chunk({ reasoning_content: "step " }),
      chunk({ reasoning_content: "one. " }),
      chunk({ reasoning_content: "done." }),
    ]);
    expect(snap.content).toEqual([{ type: "thinking", thinking: "step one. done." }]);
  });

  it("preserves thinking → text order when reasoning precedes content", () => {
    const snap = feed([
      chunk({ reasoning_content: "thinking..." }),
      chunk({ content: "answer." }),
    ]);
    expect(snap.content).toEqual([
      { type: "thinking", thinking: "thinking..." },
      { type: "text", text: "answer." },
    ]);
  });

  it("accumulates tool_calls keyed by index, stitching partial JSON arguments", () => {
    const snap = feed([
      chunk({
        tool_calls: [
          { index: 0, id: "call_1", type: "function", function: { name: "ls", arguments: "" } },
        ],
      }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"pa' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'th":"/tmp"}' } }] }),
    ]);
    expect(snap.content).toEqual([
      { type: "tool_use", id: "call_1", name: "ls", input: { path: "/tmp" } },
    ]);
  });

  it("handles two concurrent tool_calls (different indices) independently", () => {
    const snap = feed([
      chunk({
        tool_calls: [
          { index: 0, id: "call_1", type: "function", function: { name: "a", arguments: "" } },
          { index: 1, id: "call_2", type: "function", function: { name: "b", arguments: "" } },
        ],
      }),
      chunk({
        tool_calls: [
          { index: 0, function: { arguments: '{"x":1}' } },
          { index: 1, function: { arguments: '{"y":2}' } },
        ],
      }),
    ]);
    expect(snap.content).toEqual([
      { type: "tool_use", id: "call_1", name: "a", input: { x: 1 } },
      { type: "tool_use", id: "call_2", name: "b", input: { y: 2 } },
    ]);
  });

  it("keeps input as {} while tool_call arguments JSON is still partial", () => {
    const snap = feed([
      chunk({
        tool_calls: [
          { index: 0, id: "call_1", type: "function", function: { name: "ls", arguments: "{\"path\":" } },
        ],
      }),
    ]);
    expect(snap.content).toEqual([
      { type: "tool_use", id: "call_1", name: "ls", input: {} },
    ]);
  });

  it("records usage from the final usage-only chunk", () => {
    const snap = feed([
      chunk({ content: "hi" }),
      chunk({}, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }),
    ]);
    expect(snap.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
});

describe("parseAssistantMessage", () => {
  it("parses a reasoning + text + tool_call response", () => {
    const msg = parseAssistantMessage({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: "kimi",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: "picking a tool",
            reasoning_content: "let me think",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "ls", arguments: '{"path":"/"}' },
              },
            ],
            refusal: null,
          } as unknown as OpenAI.Chat.Completions.ChatCompletion["choices"][number]["message"],
          logprobs: null,
        },
      ],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    } as OpenAI.Chat.Completions.ChatCompletion);

    expect(msg).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "let me think" },
        { type: "text", text: "picking a tool" },
        { type: "tool_use", id: "call_1", name: "ls", input: { path: "/" } },
      ],
      usage: { inputTokens: 7, outputTokens: 3 },
    });
  });

  it("returns an empty content array when the upstream shape is malformed", () => {
    const msg = parseAssistantMessage(
      { choices: null } as unknown as OpenAI.Chat.Completions.ChatCompletion,
    );
    expect(msg).toEqual({ role: "assistant", content: [] });
  });
});
