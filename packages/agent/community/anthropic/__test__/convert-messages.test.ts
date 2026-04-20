import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { convertToAnthropicMessages } from "../utils";
import type { Message } from "../../../types/messages";

const TEXT_BODY = "# Hello\n\nworld";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

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

describe("convertToAnthropicMessages — pass-through", () => {
  it("converts text content verbatim", async () => {
    const { messages } = await convertToAnthropicMessages([
      userTurn([{ type: "text", text: "hi" }]),
    ]);
    expect(messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
  });

  it("converts image_url to Anthropic image block with url source", async () => {
    const { messages } = await convertToAnthropicMessages([
      userTurn([{ type: "image_url", image_url: { url: "https://example.com/a.png" } }]),
    ]);
    expect(messages[0]).toEqual({
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "url", url: "https://example.com/a.png" },
        },
      ],
    });
  });

  it("extracts system messages into the top-level system param", async () => {
    const { system, messages } = await convertToAnthropicMessages([
      { role: "system", content: [{ type: "text", text: "you are helpful" }] },
      userTurn([{ type: "text", text: "hi" }]),
    ]);
    expect(system).toEqual([{ type: "text", text: "you are helpful" }]);
    expect(messages).toHaveLength(1);
  });
});

describe("convertToAnthropicMessages — FileContent · PDF", () => {
  it("encodes PDF with URL as document block with url source", async () => {
    const { messages } = await convertToAnthropicMessages([
      userTurn([
        {
          type: "file",
          data: new URL("https://files.example.com/spec.pdf"),
          mediaType: "application/pdf",
          filename: "spec.pdf",
        },
      ]),
    ]);
    expect(messages[0].content).toEqual([
      {
        type: "document",
        source: { type: "url", url: "https://files.example.com/spec.pdf" },
        title: "spec.pdf",
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encodes PDF Uint8Array as document block with base64 source", async () => {
    const { messages } = await convertToAnthropicMessages([
      userTurn([
        {
          type: "file",
          data: PDF_BYTES,
          mediaType: "application/pdf",
        },
      ]),
    ]);
    expect(messages[0].content).toEqual([
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(PDF_BYTES).toString("base64"),
        },
      },
    ]);
  });

  it("encodes PDF ArrayBuffer as document block with base64 source", async () => {
    const buffer = PDF_BYTES.buffer.slice(PDF_BYTES.byteOffset, PDF_BYTES.byteOffset + PDF_BYTES.byteLength);
    const { messages } = await convertToAnthropicMessages([
      userTurn([{ type: "file", data: buffer, mediaType: "application/pdf" }]),
    ]);
    expect(messages[0].content).toEqual([
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(PDF_BYTES).toString("base64"),
        },
      },
    ]);
  });

  it("encodes PDF base64 string directly (no re-encoding)", async () => {
    const base64 = Buffer.from(PDF_BYTES).toString("base64");
    const { messages } = await convertToAnthropicMessages([
      userTurn([{ type: "file", data: base64, mediaType: "application/pdf" }]),
    ]);
    expect(messages[0].content).toEqual([
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      },
    ]);
  });

  it("omits title when filename is not provided", async () => {
    const { messages } = await convertToAnthropicMessages([
      userTurn([
        {
          type: "file",
          data: new URL("https://files.example.com/anon.pdf"),
          mediaType: "application/pdf",
        },
      ]),
    ]);
    expect(messages[0].content).toEqual([
      {
        type: "document",
        source: { type: "url", url: "https://files.example.com/anon.pdf" },
      },
    ]);
  });
});

describe("convertToAnthropicMessages — FileContent · text fallback", () => {
  it("fetches a text/* URL and inlines body with [File: name] header", async () => {
    const { messages } = await convertToAnthropicMessages([
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
    expect(messages[0].content).toEqual([
      { type: "text", text: `[File: notes.md]\n${TEXT_BODY}` },
    ]);
  });

  it("decodes a Uint8Array payload without fetching", async () => {
    const bytes = new TextEncoder().encode(TEXT_BODY);
    const { messages } = await convertToAnthropicMessages([
      userTurn([
        {
          type: "file",
          data: bytes,
          mediaType: "text/plain",
          filename: "a.txt",
        },
      ]),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(messages[0].content).toEqual([
      { type: "text", text: `[File: a.txt]\n${TEXT_BODY}` },
    ]);
  });

  it("decodes a base64 string payload for text files", async () => {
    const base64 = Buffer.from(TEXT_BODY, "utf-8").toString("base64");
    const { messages } = await convertToAnthropicMessages([
      userTurn([
        {
          type: "file",
          data: base64,
          mediaType: "text/plain",
        },
      ]),
    ]);
    // No filename → no header
    expect(messages[0].content).toEqual([{ type: "text", text: TEXT_BODY }]);
  });

  it("falls back to text inlining for non-PDF, non-text media types", async () => {
    const { messages } = await convertToAnthropicMessages([
      userTurn([
        {
          type: "file",
          data: new URL("https://files.example.com/data.bin"),
          mediaType: "application/octet-stream",
          filename: "data.bin",
        },
      ]),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(messages[0].content).toEqual([
      { type: "text", text: `[File: data.bin]\n${TEXT_BODY}` },
    ]);
  });

  it("preserves surrounding text and image blocks in the same turn", async () => {
    const { messages } = await convertToAnthropicMessages([
      userTurn([
        { type: "text", text: "look:" },
        { type: "image_url", image_url: { url: "https://i/a.png" } },
        {
          type: "file",
          data: new URL("https://files.example.com/notes.md"),
          mediaType: "text/markdown",
          filename: "notes.md",
        },
      ]),
    ]);
    expect(messages[0].content).toEqual([
      { type: "text", text: "look:" },
      { type: "image", source: { type: "url", url: "https://i/a.png" } },
      { type: "text", text: `[File: notes.md]\n${TEXT_BODY}` },
    ]);
  });
});
