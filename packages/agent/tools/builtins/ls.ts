import * as z from "zod";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { defineTool } from "../tool";

export const lsTool = defineTool({
  name: "ls",
  description:
    "List the contents of a directory up to 2 levels deep in tree format.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to list this directory. Always place `description` as the first parameter."),
    path: z
      .string()
      .describe("The absolute path to the directory to list."),
  }),
  invoke: async ({ path }, _ctx) => {
    const results: string[] = [];

    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.isDirectory() ? `${entry.name}/` : entry.name;
      results.push(name);

      if (entry.isDirectory()) {
        try {
          const subEntries = await readdir(join(path, entry.name), { withFileTypes: true });
          for (const sub of subEntries) {
            const subName = sub.isDirectory() ? `${sub.name}/` : sub.name;
            results.push(`  ${subName}`);
          }
        } catch {
          // permission denied or other error, skip
        }
      }
    }

    if (results.length === 0) return "(empty)";
    return results.join("\n");
  },
});
