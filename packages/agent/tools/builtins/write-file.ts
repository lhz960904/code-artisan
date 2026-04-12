import * as z from "zod";
import { defineTool } from "../tool";

export const writeFileTool = defineTool({
  name: "write_file",
  description: "Write text content to a file. Creates directories as needed.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to write this file. Always place `description` as the first parameter."),
    path: z.string().describe("The absolute path to the file to write to. Must be an absolute path, not relative."),
    content: z.string().describe("The content to write to the file."),
    append: z
      .boolean()
      .optional()
      .describe("Whether to append instead of overwriting."),
  }),
  invoke: async ({ path, content, append }, ctx) => {
    await ctx.sandbox.writeFile(path, content, { append });
    return "OK";
  },
});
