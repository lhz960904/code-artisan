import * as z from "zod";
import { defineTool } from "../tool";

export const MAX_GLOB_RESULTS = 500;

export const globTool = defineTool({
  name: "glob",
  description:
    "Find files matching a glob pattern. Supports wildcards (*), recursive (**), character classes ([a-z]), and extension filters (*.ts).",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to search for files. Always place `description` as the first parameter."),
    pattern: z.string().describe("Glob pattern to match (e.g. '**/*.ts', 'src/*.js')."),
    path: z.string().describe("The absolute path to the directory to search in. Must be an absolute path, not relative."),
  }),
  invoke: async ({ pattern, path }, ctx) => {
    const result = await ctx.sandbox.glob(pattern, path);
    if (result.error) {
      return `Error: ${result.error}`;
    }

    if (result.files.length === 0) {
      return `No matches found for pattern "${pattern}" in ${path}`;
    }

    const paths = result.files.map((f) => (f.is_dir ? `${f.path}/` : f.path));
    const truncated = paths.length >= MAX_GLOB_RESULTS;
    const shown = truncated ? paths.slice(0, MAX_GLOB_RESULTS) : paths;
    const body = `Found ${shown.length} matches:\n${shown.join("\n")}`;

    if (truncated) {
      return `${body}\n\n[Warning: Results truncated at ${MAX_GLOB_RESULTS} files. Consider using a more specific pattern to narrow down results.]`;
    }
    return body;
  },
});
