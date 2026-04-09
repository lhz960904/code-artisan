import * as z from "zod";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { defineTool } from "../tool";

export const writeFileTool = defineTool({
  name: "write_file",
  description: "Write text content to a file. Creates directories as needed.",
  parameters: z.object({
    path: z.string().describe("The absolute path to the file to write to."),
    content: z.string().describe("The content to write to the file."),
    append: z
      .boolean()
      .optional()
      .describe("Whether to append instead of overwriting."),
  }),
  invoke: async ({ path, content, append }) => {
    await mkdir(dirname(path), { recursive: true });
    if (append) {
      const existing = await Bun.file(path).text().catch(() => "");
      await Bun.write(path, existing + content);
    } else {
      await Bun.write(path, content);
    }
    return "OK";
  },
});
