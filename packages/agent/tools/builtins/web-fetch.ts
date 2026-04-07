import * as z from "zod";
import { defineTool, type FunctionTool } from "../tool";

export function createWebFetchTool(apiKey: string): FunctionTool {
  return defineTool({
    name: "web_fetch",
    description:
      "Fetch and extract the main readable content from a web page URL. Use after web_search to read full page content.",
    parameters: z.object({
      url: z.string().url().describe("The URL to fetch and extract content from."),
    }),
    invoke: async ({ url }) => {
      const res = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, urls: [url] }),
      });

      if (!res.ok) {
        throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as {
        results: { url: string; raw_content: string }[];
      };

      if (!data.results?.length || !data.results[0].raw_content) {
        return `Failed to extract content from: ${url}`;
      }

      return `Content from: ${url}\n\n${data.results[0].raw_content}`;
    },
  });
}
