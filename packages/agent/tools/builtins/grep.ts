import * as z from "zod";
import { defineTool } from "../tool";

export const grepTool = defineTool({
  name: "grep",
  description:
    "Search for a text pattern across files in a directory. Returns matching lines with file paths and line numbers. Searches recursively.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to search for this pattern. Always place `description` as the first parameter."),
    pattern: z.string().describe("The text pattern to search for (literal string, not regex)."),
    path: z.string().describe("The absolute path to the directory to search in. Must be an absolute path, not relative."),
    include: z
      .string()
      .optional()
      .describe("Optional glob pattern to filter files (e.g. '*.ts', '*.py')."),
  }),
  invoke: async ({ pattern, path, include }, ctx) => {
    const result = await ctx.sandbox.grep(pattern, path, include);
    if (result.error) {
      return `Error: ${result.error}`;
    }

    if (result.matches.length === 0) {
      return `No matches found for "${pattern}" in ${path}`;
    }

    const lines = result.matches.map((m) => `${m.path}:${m.line}:${m.text}`);
    return `Found ${lines.length} matches:\n${lines.join("\n")}`;
  },
});
