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
    path: z.string().describe("The absolute path to the directory to search in."),
  }),
  invoke: async ({ pattern, path }, _ctx) => {
    const glob = new Bun.Glob(pattern);
    const files: string[] = [];
    let truncated = false;

    for await (const file of glob.scan({ cwd: path, dot: false })) {
      if (files.length >= MAX_GLOB_RESULTS) {
        truncated = true;
        break;
      }
      files.push(file);
    }

    if (files.length === 0) {
      return `No matches found for pattern "${pattern}" in ${path}`;
    }

    const result = `Found ${files.length} matches:\n${files.join("\n")}`;

    if (truncated) {
      return `${result}\n\n[Warning: Results truncated at ${MAX_GLOB_RESULTS} files. Consider using a more specific pattern to narrow down results.]`;
    }

    return result;
  },
});
