import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebFetchTool } from "../builtins/web-fetch.js";
import type { ToolRuntime } from "../base.js";

const mockRuntime: ToolRuntime = {
  sandbox: {} as ToolRuntime["sandbox"],
  conversationId: "test",
};

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("WebFetchTool", () => {
  it("has correct name and description", () => {
    const tool = new WebFetchTool("test-key");
    expect(tool.name).toBe("web_fetch");
    expect(tool.description).toBeTruthy();
  });

  it("rejects invalid input (missing url)", async () => {
    const tool = new WebFetchTool("test-key");
    const result = await tool.call(mockRuntime, { description: "test" });
    expect(result).toContain("Error: Invalid input");
  });

  it("rejects invalid URL format", async () => {
    const tool = new WebFetchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "test",
      url: "not-a-url",
    });
    expect(result).toContain("Error: Invalid input");
  });

  it("formats extracted content correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            url: "https://example.com/page",
            raw_content: "This is the extracted page content.",
          },
        ],
      }),
    });

    const tool = new WebFetchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "testing",
      url: "https://example.com/page",
    });

    expect(result).toContain("Content from: https://example.com/page");
    expect(result).toContain("This is the extracted page content.");
  });

  it("sends correct request to Tavily Extract API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ url: "https://example.com", raw_content: "content" }] }),
    });

    const tool = new WebFetchTool("my-api-key");
    await tool.call(mockRuntime, {
      description: "testing",
      url: "https://example.com",
    });

    expect(mockFetch).toHaveBeenCalledWith("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: "my-api-key",
        urls: ["https://example.com"],
      }),
    });
  });

  it("handles empty results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const tool = new WebFetchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "testing",
      url: "https://example.com",
    });

    expect(result).toContain("Failed to extract content");
  });

  it("handles API error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const tool = new WebFetchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "testing",
      url: "https://example.com",
    });

    expect(result).toContain("Error");
    expect(result).toContain("500");
  });

  it("handles network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"));

    const tool = new WebFetchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "testing",
      url: "https://example.com",
    });

    expect(result).toContain("Error");
    expect(result).toContain("DNS resolution failed");
  });
});
