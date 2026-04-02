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
