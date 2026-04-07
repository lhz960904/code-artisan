import * as z from "zod";
import { defineTool, type FunctionTool } from "../tool";
import type { Sandbox } from "../../sandbox/base";

export function createLsTool(sandbox: Sandbox): FunctionTool {
  return defineTool({
    name: "ls",
    description:
      "List the contents of a directory up to 2 levels deep in tree format.",
    parameters: z.object({
      path: z
        .string()
        .describe("The absolute path to the directory to list."),
    }),
    invoke: async ({ path }) => {
      const entries = await sandbox.listDir(path);
      if (entries.length === 0) return "(empty)";
      return entries.join("\n");
    },
  });
}
