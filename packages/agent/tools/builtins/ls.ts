import * as z from "zod";
import { defineTool } from "../tool";

export const lsTool = defineTool({
  name: "ls",
  description:
    "List the contents of a directory (up to 2 levels deep).",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to list this directory. Always place `description` as the first parameter."),
    path: z
      .string()
      .describe("The absolute path to the directory to list. Must be an absolute path, not relative."),
  }),
  invoke: async ({ path }, ctx) => {
    const entries = await ctx.sandbox.listDir(path);
    if (entries.length === 0) return "(empty)";

    // Full relative paths — hierarchy is unambiguous from path itself.
    // e.g.  "src/"  "src/index.ts"  "package.json"
    const lines = entries.map((e) => (e.is_dir ? `${e.path}/` : e.path));
    return lines.sort().join("\n");
  },
});
