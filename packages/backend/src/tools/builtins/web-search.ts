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
      ...(input.includeDomains?.length ? { include_domains: input.includeDomains } : {}),
      ...(input.excludeDomains?.length ? { exclude_domains: input.excludeDomains } : {}),
      include_answer: false,
    };

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
