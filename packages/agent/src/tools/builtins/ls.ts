import * as z from "zod";
import { tool } from "../tool";

export const lsTool = tool({
  name: "ls",
  description:
    "List the contents of a directory up to 2 levels deep in tree format.",
  parameters: z.object({
    path: z
      .string()
      .describe("The absolute path to the directory to list."),
  }),
  maxOutputChars: 12000,
  execute: async ({ path }, { sandbox }) => {
    const entries = await sandbox.listDir(path);
    if (entries.length === 0) return "(empty)";
    return entries.join("\n");
  },
});
