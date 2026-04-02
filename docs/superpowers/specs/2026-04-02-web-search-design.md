# Web Search & Web Fetch Tools Design

## Overview

Add two tools to code-artisan's agent: `web_search` (search the web via Tavily) and `web_fetch` (extract content from a specific URL via Tavily Extract). These give the agent access to current information beyond its training cutoff.

## Decisions

- **Search provider**: Tavily — optimized for AI agents, structured output, free tier 1000 req/month
- **Two independent tools** instead of one multi-mode tool — matches existing tool patterns (bash, read_file, write_file), clearer for agent
- **No rate limiting / quota** for MVP — Tavily free tier is sufficient
- **No caching** — premature optimization for MVP
- **No frontend changes** — existing tool call UI handles new tools generically
- **No DB schema changes**

## Tool: `web_search`

**Purpose**: Search the web for current information, documentation, tutorials, etc.

**Input Schema** (Zod):

```typescript
z.object({
  description: z.string().describe("Why you need to search the web"),
  query: z.string().describe("Search query string"),
  maxResults: z.number().min(1).max(10).default(5).describe("Number of results to return"),
  searchDepth: z.enum(["basic", "advanced"]).default("basic").describe("basic = fast snippets, advanced = deeper content extraction"),
  includeDomains: z.array(z.string()).optional().describe("Only include results from these domains"),
  excludeDomains: z.array(z.string()).optional().describe("Exclude results from these domains"),
})
```

**Tavily API Call**:

```
POST https://api.tavily.com/search
Content-Type: application/json

{
  "query": "<query>",
  "max_results": <maxResults>,
  "search_depth": "<searchDepth>",
  "include_domains": [...],
  "exclude_domains": [...],
  "include_answer": false
}
```

**Output Format** (returned to agent as text):

```
Search results for: "<query>"

[1] <title>
    <snippet/content>
    URL: <url>

[2] <title>
    <snippet/content>
    URL: <url>

...
```

Output passed through `truncateOutput()` (12,000 char limit).

## Tool: `web_fetch`

**Purpose**: Extract readable content from a specific URL. Used after `web_search` when the agent needs full page content.

**Input Schema** (Zod):

```typescript
z.object({
  description: z.string().describe("Why you need to fetch this page"),
  url: z.string().url().describe("The URL to fetch and extract content from"),
})
```

**Tavily API Call**:

```
POST https://api.tavily.com/extract
Content-Type: application/json

{
  "urls": ["<url>"]
}
```

**Output Format**:

```
Content from: <url>

<extracted text content>
```

Output passed through `truncateOutput()` (12,000 char limit).

## Implementation Details

### New Files

1. **`/packages/backend/src/tools/builtins/web-search.ts`** — WebSearchTool class
2. **`/packages/backend/src/tools/builtins/web-fetch.ts`** — WebFetchTool class

### Modified Files

3. **`/packages/backend/src/tools/index.ts`** — Register both tools (conditional on TAVILY_API_KEY)
4. **`/packages/backend/src/env.ts`** — Add `TAVILY_API_KEY` env var (optional)
5. **`/.env.example`** — Add `TAVILY_API_KEY` placeholder

### Conditional Registration

If `TAVILY_API_KEY` is not set, the tools are not registered — the agent won't see them. No runtime errors for missing config.

```typescript
// tools/index.ts
if (env.TAVILY_API_KEY) {
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new WebFetchTool());
}
```

### Error Handling

| Scenario | Behavior |
|---|---|
| TAVILY_API_KEY not set | Tools not registered, agent unaware |
| Network timeout | Return error string, agent can retry |
| Tavily 429 (rate limit) | Return error string with message |
| Tavily 4xx/5xx | Return error string with status |
| Empty results | Return "No results found for: <query>" |
| Invalid URL (web_fetch) | Zod validation rejects before API call |

### HTTP Client

Use native `fetch()` (Node.js 18+ built-in). No new dependencies needed.

### ToolRuntime

Both tools do NOT need sandbox access — they make external HTTP calls directly from the backend process. The existing `ToolRuntime` interface passes `sandbox` but tools are not required to use it.

## Testing

- Unit tests for output formatting
- Unit tests for input validation (Zod schema)
- Integration test with mocked Tavily responses (verify HTTP request shape + response parsing)

## Out of Scope

- Search result caching
- Per-user search quota / rate limiting
- News-specific search mode
- Image search
- Frontend UI customization for search results
