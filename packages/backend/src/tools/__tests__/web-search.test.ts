import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSearchTool } from "../builtins/web-search.js";
import type { ToolRuntime } from "../base.js";

const mockRuntime: ToolRuntime = {
  sandbox: {} as ToolRuntime["sandbox"],
  conversationId: "test",
};

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("WebSearchTool", () => {
  it("has correct name and description", () => {
    const tool = new WebSearchTool("test-key");
    expect(tool.name).toBe("web_search");
    expect(tool.description).toBeTruthy();
  });

  it("rejects invalid input (missing query)", async () => {
    const tool = new WebSearchTool("test-key");
    const result = await tool.call(mockRuntime, { description: "test" });
    expect(result).toContain("Error: Invalid input");
  });

  it("formats search results correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: "Result One", content: "Snippet one", url: "https://example.com/1" },
          { title: "Result Two", content: "Snippet two", url: "https://example.com/2" },
        ],
      }),
    });

    const tool = new WebSearchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "testing",
      query: "test query",
    });

    expect(result).toContain('Search results for: "test query"');
    expect(result).toContain("[1] Result One");
    expect(result).toContain("Snippet one");
    expect(result).toContain("https://example.com/1");
    expect(result).toContain("[2] Result Two");
  });

  it("sends correct request to Tavily API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const tool = new WebSearchTool("my-api-key");
    await tool.call(mockRuntime, {
      description: "testing",
      query: "test query",
      maxResults: 3,
      searchDepth: "advanced",
      includeDomains: ["example.com"],
      excludeDomains: ["spam.com"],
    });

    expect(mockFetch).toHaveBeenCalledWith("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: "my-api-key",
        query: "test query",
        max_results: 3,
        search_depth: "advanced",
        include_domains: ["example.com"],
        exclude_domains: ["spam.com"],
        include_answer: false,
      }),
    });
  });

  it("returns message when no results found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const tool = new WebSearchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "testing",
      query: "obscure query",
    });

    expect(result).toContain("No results found");
  });

  it("handles API error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    const tool = new WebSearchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "testing",
      query: "test",
    });

    expect(result).toContain("Error");
    expect(result).toContain("429");
  });

  it("handles network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const tool = new WebSearchTool("test-key");
    const result = await tool.call(mockRuntime, {
      description: "testing",
      query: "test",
    });

    expect(result).toContain("Error");
    expect(result).toContain("Network failure");
  });
});
