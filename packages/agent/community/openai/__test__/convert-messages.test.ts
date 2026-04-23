import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { convertToOpenAIMessages } from "../utils";
import type { Message } from "../../../types/messages";

const TEXT_BODY = "# Hello\n\nworld";

const originalFetch = globalThis.fetch;
const fetchMock = mock(async () => new Response(TEXT_BODY, { status: 200 }));

beforeEach(() => {
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function userTurn(content: Message["content"]): Message {
  return { role: "user", content } as Message;
}

describe("convertToOpenAIMessages — user content", () => {
  it("converts text content to a text part", async () => {
    const out = await convertToOpenAIMessages([userTurn([{ type: "text", text: "hi" }])]);
    expect(out[0]).toEqual({ role: "user", content: [{ type: "text", text: "hi" }] });
  });

  it("converts image_url to an image_url part", async () => {
    const out = await convertToOpenAIMessages([
      userTurn([{ type: "image_url", image_url: { url: "https://example.com/a.png" } }]),
    ]);
    expect(out[0]).toEqual({
      role: "user",
      content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }],
    });
  });

  it("inlines FileContent as text (with filename header) — PDFs too", async () => {
    const bytes = new TextEncoder().encode(TEXT_BODY);
    const out = await convertToOpenAIMessages([
      userTurn([
        { type: "file", data: bytes, mediaType: "text/plain", filename: "a.txt" },
      ]),
    ]);
    expect(out[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: `[File: a.txt]\n${TEXT_BODY}` }],
    });
  });

  it("fetches URL files when payload is a URL", async () => {
    await convertToOpenAIMessages([
      userTurn([
        {
          type: "file",
          data: new URL("https://files.example.com/notes.md"),
          mediaType: "text/markdown",
          filename: "notes.md",
        },
      ]),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("convertToOpenAIMessages — system message", () => {
  it("flattens system content into a single system message with joined text", async () => {
    const out = await convertToOpenAIMessages([
      {
        role: "system",
        content: [
          { type: "text", text: "you are helpful" },
          { type: "text", text: "and concise" },
        ],
      },
      userTurn([{ type: "text", text: "hi" }]),
    ]);
    expect(out[0]).toEqual({ role: "system", content: "you are helpful\nand concise" });
    expect(out).toHaveLength(2);
  });
});

describe("convertToOpenAIMessages — assistant content", () => {
  it("flattens text + tool_use into content + tool_calls", async () => {
    const out = await convertToOpenAIMessages([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Working on it..." },
          {
            type: "tool_use",
            id: "call_1",
            name: "read_file",
            input: { path: "/tmp/a.txt" },
          },
        ],
      },
    ]);
    expect(out[0]).toEqual({
      role: "assistant",
      content: "Working on it...",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "read_file", arguments: JSON.stringify({ path: "/tmp/a.txt" }) },
        },
      ],
    });
  });

  it("folds thinking blocks into reasoning_content (non-standard field)", async () => {
    const out = await convertToOpenAIMessages([
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Let me think. " },
          { type: "thinking", thinking: "Step two." },
          { type: "text", text: "Done." },
        ],
      },
    ]);
    expect(out[0]).toMatchObject({
      role: "assistant",
      content: "Done.",
      reasoning_content: "Let me think. Step two.",
    });
  });

  it("uses null content when the assistant emitted only tool_use", async () => {
    const out = await convertToOpenAIMessages([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "ls", input: { path: "/tmp" } },
        ],
      },
    ]);
    expect(out[0]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "ls", arguments: JSON.stringify({ path: "/tmp" }) },
        },
      ],
    });
  });

  it("omits tool_calls when the assistant emitted only text", async () => {
    const out = await convertToOpenAIMessages([
      { role: "assistant", content: [{ type: "text", text: "Here you go." }] },
    ]);
    expect(out[0]).toEqual({ role: "assistant", content: "Here you go." });
  });
});

describe("convertToOpenAIMessages — tool role", () => {
  it("expands each tool_result block into its own tool message", async () => {
    const out = await convertToOpenAIMessages([
      {
        role: "tool",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "result A" },
          { type: "tool_result", tool_use_id: "call_2", content: "result B" },
        ],
      },
    ]);
    expect(out).toEqual([
      { role: "tool", tool_call_id: "call_1", content: "result A" },
      { role: "tool", tool_call_id: "call_2", content: "result B" },
    ]);
  });
});
