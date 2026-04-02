# Web Search & Web Fetch Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `web_search` and `web_fetch` tools to the agent, powered by Tavily API, so the agent can search the web and extract page content.

**Architecture:** Two independent tool classes extending `BaseTool`, registered conditionally when `TAVILY_API_KEY` is set. Both use native `fetch()` to call Tavily's REST API. No frontend/DB changes needed.

**Tech Stack:** Tavily Search API + Tavily Extract API, Zod validation, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-04-02-web-search-design.md`

---

### Task 1: Add TAVILY_API_KEY to environment config

**Files:**
- Modify: `packages/backend/src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add TAVILY_API_KEY to env schema**

In `packages/backend/src/env.ts`, change the schema to make `TAVILY_API_KEY` optional:

```typescript
const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string(),
  E2B_API_KEY: z.string().min(1),
  TAVILY_API_KEY: z.string().optional(),
});
```

- [ ] **Step 2: Add placeholder to .env.example**

Append to `.env.example`:

```
# Tavily (web search, optional)
TAVILY_API_KEY=tvly-xxx
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/env.ts .env.example
git commit -m "feat: add TAVILY_API_KEY env var for web search tools"
```

---

### Task 2: Implement WebSearchTool

**Files:**
- Create: `packages/backend/src/tools/builtins/web-search.ts`
- Test: `packages/backend/src/tools/__tests__/web-search.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/backend/src/tools/__tests__/web-search.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/backend && npx vitest run src/tools/__tests__/web-search.test.ts`
Expected: FAIL — module `../builtins/web-search.js` not found.

- [ ] **Step 3: Implement WebSearchTool**

Create `packages/backend/src/tools/builtins/web-search.ts`:

```typescript
import * as z from "zod";
import { BaseTool, truncateOutput, type ToolRuntime } from "../base.js";

const schema = z.object({
  description: z
    .string()
    .describe(
      "Explain why you need to search the web. ALWAYS PROVIDE THIS PARAMETER FIRST.",
    ),
  query: z.string().describe("The search query string"),
  maxResults: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe("Number of results to return (1-10)"),
  searchDepth: z
    .enum(["basic", "advanced"])
    .default("basic")
    .describe("basic = fast snippets, advanced = deeper content extraction"),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe("Only include results from these domains (e.g. ['stackoverflow.com'])"),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe("Exclude results from these domains"),
});

interface TavilyResult {
  title: string;
  content: string;
  url: string;
}

interface TavilySearchResponse {
  results: TavilyResult[];
}

export class WebSearchTool extends BaseTool<typeof schema> {
  name = "web_search";
  description =
    "Search the web for current information, documentation, tutorials, or any topic. Returns titles, snippets, and URLs. Use web_fetch to read full page content after finding relevant URLs.";
  schema = schema;

  constructor(private apiKey: string) {
    super();
  }

  protected async _call(
    _runtime: ToolRuntime,
    input: z.infer<typeof schema>,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      query: input.query,
      max_results: input.maxResults,
      search_depth: input.searchDepth,
      include_answer: false,
    };
    if (input.includeDomains?.length) {
      body.include_domains = input.includeDomains;
    }
    if (input.excludeDomains?.length) {
      body.exclude_domains = input.excludeDomains;
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TavilySearchResponse;

    if (!data.results || data.results.length === 0) {
      return `No results found for: "${input.query}"`;
    }

    const formatted = data.results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title}\n    ${r.content}\n    URL: ${r.url}`,
      )
      .join("\n\n");

    return truncateOutput(`Search results for: "${input.query}"\n\n${formatted}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/backend && npx vitest run src/tools/__tests__/web-search.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/tools/builtins/web-search.ts packages/backend/src/tools/__tests__/web-search.test.ts
git commit -m "feat: implement web_search tool with Tavily API"
```

---

### Task 3: Implement WebFetchTool

**Files:**
- Create: `packages/backend/src/tools/builtins/web-fetch.ts`
- Test: `packages/backend/src/tools/__tests__/web-fetch.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/backend/src/tools/__tests__/web-fetch.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/backend && npx vitest run src/tools/__tests__/web-fetch.test.ts`
Expected: FAIL — module `../builtins/web-fetch.js` not found.

- [ ] **Step 3: Implement WebFetchTool**

Create `packages/backend/src/tools/builtins/web-fetch.ts`:

```typescript
import * as z from "zod";
import { BaseTool, truncateOutput, type ToolRuntime } from "../base.js";

const schema = z.object({
  description: z
    .string()
    .describe(
      "Explain why you need to fetch this page. ALWAYS PROVIDE THIS PARAMETER FIRST.",
    ),
  url: z
    .string()
    .url()
    .describe("The URL to fetch and extract content from"),
});

interface TavilyExtractResult {
  url: string;
  raw_content: string;
}

interface TavilyExtractResponse {
  results: TavilyExtractResult[];
}

export class WebFetchTool extends BaseTool<typeof schema> {
  name = "web_fetch";
  description =
    "Fetch and extract the main readable content from a web page URL. Use this after web_search to read full page content from a specific URL.";
  schema = schema;

  constructor(private apiKey: string) {
    super();
  }

  protected async _call(
    _runtime: ToolRuntime,
    input: z.infer<typeof schema>,
  ): Promise<string> {
    const res = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        urls: [input.url],
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TavilyExtractResponse;

    if (!data.results || data.results.length === 0 || !data.results[0].raw_content) {
      return `Failed to extract content from: ${input.url}`;
    }

    return truncateOutput(`Content from: ${input.url}\n\n${data.results[0].raw_content}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/backend && npx vitest run src/tools/__tests__/web-fetch.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/tools/builtins/web-fetch.ts packages/backend/src/tools/__tests__/web-fetch.test.ts
git commit -m "feat: implement web_fetch tool with Tavily Extract API"
```

---

### Task 4: Register tools and run full test suite

**Files:**
- Modify: `packages/backend/src/tools/index.ts`

- [ ] **Step 1: Register both tools conditionally**

Update `packages/backend/src/tools/index.ts` — add imports and conditional registration after existing registrations:

```typescript
import { WebSearchTool } from "./builtins/web-search.js";
import { WebFetchTool } from "./builtins/web-fetch.js";
import { env } from "../env.js";

// Web search tools (optional, requires TAVILY_API_KEY)
if (env.TAVILY_API_KEY) {
  toolRegistry.register(new WebSearchTool(env.TAVILY_API_KEY));
  toolRegistry.register(new WebFetchTool(env.TAVILY_API_KEY));
}
```

- [ ] **Step 2: Run full test suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests PASS (existing + new).

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/tools/index.ts
git commit -m "feat: register web_search and web_fetch tools when TAVILY_API_KEY is set"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Add TAVILY_API_KEY to local .env**

Add your Tavily API key to `packages/backend/.env` (or root `.env`):

```
TAVILY_API_KEY=tvly-your-actual-key
```

- [ ] **Step 2: Start the dev server**

Run: `cd packages/backend && pnpm dev`
Verify in logs: no startup errors.

- [ ] **Step 3: Test via chat**

Open the frontend, start a new conversation, and ask the agent something like:
"Search the web for the latest Vite 6 release notes and summarize them."

Expected: Agent uses `web_search` tool, gets results, optionally uses `web_fetch` to read a page, and returns a summary.

- [ ] **Step 4: Verify tool shows in system prompt**

Check agent logs — the system prompt should include `web_search` and `web_fetch` in the tools section.
