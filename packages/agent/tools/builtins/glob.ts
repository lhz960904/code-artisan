import * as z from "zod";
import { defineTool, type FunctionTool } from "../tool";
import type { Sandbox } from "../../sandbox/base";

export function createGlobTool(sandbox: Sandbox): FunctionTool {
  return defineTool({
    name: "glob",
    description:
      "Find files matching a glob pattern. Supports wildcards (*), recursive (**), character classes ([a-z]), and extension filters (*.ts).",
    parameters: z.object({
      pattern: z.string().describe("Glob pattern to match (e.g. '**/*.ts', 'src/*.js')."),
      path: z.string().describe("The absolute path to the directory to search in."),
    }),
    invoke: async ({ pattern, path }) => {
      const result = await sandbox.glob(pattern, path);

      if (result.error) {
        return `Error: ${result.error}`;
      }

      if (result.files.length === 0) {
        return `No matches found for pattern "${pattern}" in ${path}`;
      }

      const formatted = result.files
        .map((f) => (f.is_dir ? `${f.path}/` : f.path))
        .join("\n");

      return `Found ${result.files.length} matches:\n${formatted}`;
    },
  });
}
