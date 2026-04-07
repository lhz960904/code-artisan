import * as z from "zod";
import { defineTool, type FunctionTool } from "../tool";
import type { Sandbox } from "../../sandbox/base";

export function createGrepTool(sandbox: Sandbox): FunctionTool {
  return defineTool({
    name: "grep",
    description:
      "Search for a text pattern across files in a directory. Returns matching lines with file paths and line numbers. Searches recursively.",
    parameters: z.object({
      pattern: z.string().describe("The text pattern to search for (literal string, not regex)."),
      path: z.string().describe("The absolute path to the directory to search in."),
      include: z
        .string()
        .optional()
        .describe("Optional glob pattern to filter files (e.g. '*.ts', '*.py')."),
    }),
    invoke: async ({ pattern, path, include }) => {
      const result = await sandbox.grep(pattern, path, include);

      if (result.error) {
        return `Error: ${result.error}`;
      }

      if (result.matches.length === 0) {
        return `No matches found for "${pattern}" in ${path}`;
      }

      const formatted = result.matches
        .map((m) => `${m.path}:${m.line}: ${m.text}`)
        .join("\n");

      return `Found ${result.matches.length} matches:\n${formatted}`;
    },
  });
}
