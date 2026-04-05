import * as z from "zod";
import { tool } from "../tool";

export const strReplaceTool = tool({
  name: "str_replace",
  description:
    "Replace a substring in a file. If replace_all is false (default), only the first occurrence is replaced.",
  parameters: z.object({
    path: z.string().describe("The absolute path to the file."),
    old_str: z.string().describe("The substring to replace."),
    new_str: z.string().describe("The new substring."),
    replace_all: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to replace all occurrences."),
  }),
  execute: async ({ path, old_str, new_str, replace_all }, { sandbox }) => {
    let content = await sandbox.readFile(path);

    if (!content.includes(old_str)) {
      return `Error: String to replace not found in file: ${path}`;
    }

    if (replace_all) {
      content = content.replaceAll(old_str, new_str);
    } else {
      content = content.replace(old_str, new_str);
    }

    await sandbox.writeFile(path, content);
    return "OK";
  },
});
