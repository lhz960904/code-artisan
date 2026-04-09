import * as z from "zod";
import { defineTool } from "../tool";

export const grepTool = defineTool({
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
    const args = ["grep", "-rn", "--fixed-strings", "--max-count=500"];
    if (include) {
      args.push(`--include=${include}`);
    }
    args.push("--", pattern, path);

    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const lines = stdout.trim().split("\n").filter(Boolean);

    if (lines.length === 0) {
      return `No matches found for "${pattern}" in ${path}`;
    }

    return `Found ${lines.length} matches:\n${lines.join("\n")}`;
  },
});
