import * as z from "zod";
import { tool } from "../tool";

export const writeFileTool = tool({
  name: "write_file",
  description: "Write text content to a file. Creates directories as needed.",
  parameters: z.object({
    path: z.string().describe("The absolute path to the file to write to."),
    content: z.string().describe("The content to write to the file."),
    append: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to append instead of overwriting."),
  }),
  execute: async ({ path, content, append }, { sandbox }) => {
    await sandbox.writeFile(path, content, { append });
    return "OK";
  },
});
