import * as z from "zod";
import { defineTool } from "../tool";

const MAX_FILE_CHARS = 12000;

export const readFileTool = defineTool({
  name: "read_file",
  description:
    "Read the contents of a text file. Use this to examine source code, configuration files, logs, or any text-based file.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to read this file. Always place `description` as the first parameter."),
    path: z.string().describe("The absolute path to the file to read."),
    start_line: z
      .number()
      .optional()
      .describe("Optional starting line number (1-indexed, inclusive)."),
    end_line: z
      .number()
      .optional()
      .describe("Optional ending line number (1-indexed, inclusive)."),
  }),
  invoke: async ({ path, start_line, end_line }) => {
    let content = await Bun.file(path).text();
    if (!content) return "(empty)";

    if (start_line != null && end_line != null) {
      const lines = content.split("\n");
      content = lines.slice(start_line - 1, end_line).join("\n");
    }

    if (content.length > MAX_FILE_CHARS) {
      const totalLines = content.split("\n").length;
      const headChars = Math.floor(MAX_FILE_CHARS * 0.8);
      const tailChars = Math.floor(MAX_FILE_CHARS * 0.2);
      const head = content.slice(0, headChars);
      const tail = content.slice(-tailChars);
      const omitted = content.length - headChars - tailChars;
      return `${head}\n\n[... ${omitted} characters omitted (${content.length} total) ...]\n\n${tail}\n\n[File has ${totalLines} lines. Use start_line and end_line to read specific ranges.]`;
    }

    return content;
  },
});
