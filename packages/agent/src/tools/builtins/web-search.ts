import * as z from "zod";
import { tool } from "../tool";
import type { DefinedTool } from "../tool";

export function createWebSearchTool(apiKey: string): DefinedTool {
  return tool({
    name: "web_search",
    description:
      "Search the web for current information, documentation, or any topic. Returns titles, snippets, and URLs.",
    parameters: z.object({
      query: z.string().describe("The search query string."),
      maxResults: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .optional()
        .describe("Number of results to return (1-10)."),
      searchDepth: z
        .enum(["basic", "advanced"])
        .default("basic")
        .optional()
        .describe("basic = fast snippets, advanced = deeper content."),
    }),
    maxOutputChars: 12000,
    execute: async ({ query, maxResults, searchDepth }) => {
      const body: Record<string, unknown> = {
        api_key: apiKey,
        query,
        max_results: maxResults ?? 5,
        search_depth: searchDepth ?? "basic",
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

      const data = (await res.json()) as {
        results: { title: string; content: string; url: string }[];
      };

      if (!data.results?.length) {
        return `No results found for: "${query}"`;
      }

      const formatted = data.results
        .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.content}\n    URL: ${r.url}`)
        .join("\n\n");

      return `Search results for: "${query}"\n\n${formatted}`;
    },
  });
}
