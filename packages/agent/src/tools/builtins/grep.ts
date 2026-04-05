import * as z from "zod";
import { tool } from "../tool";

export const grepTool = tool({
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
  maxOutputChars: 12000,
  execute: async ({ pattern, path, include }, { sandbox }) => {
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
