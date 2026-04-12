import * as z from "zod";
import { defineTool } from "../tool";

export const strReplaceTool = defineTool({
  name: "str_replace",
  description:
    "Replace a substring in a file. If replace_all is false (default), only the first occurrence is replaced.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to make this replacement. Always place `description` as the first parameter."),
    path: z.string().describe("The absolute path to the file. Must be an absolute path, not relative."),
    old_str: z.string().describe("The substring to replace."),
    new_str: z.string().describe("The new substring."),
    replace_all: z
      .boolean()
      .optional()
      .describe("Whether to replace all occurrences."),
  }),
  invoke: async ({ path, old_str, new_str, replace_all }, ctx) => {
    let content = await ctx.sandbox.readFile(path);

    if (!content.includes(old_str)) {
      return `Error: String to replace not found in file: ${path}`;
    }

    if (replace_all) {
      content = content.replaceAll(old_str, new_str);
    } else {
      content = content.replace(old_str, new_str);
    }

    await ctx.sandbox.writeFile(path, content);
    return "OK";
  },
});
