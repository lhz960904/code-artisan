import * as z from "zod";
import { BaseTool, truncateOutput, type ToolRuntime } from "../base.js";

const schema = z.object({
  description: z
    .string()
    .describe(
      "Explain why you are reading this file in short words. ALWAYS PROVIDE THIS PARAMETER FIRST.",
    ),
  path: z.string().describe("The absolute path to the file to read."),
  start_line: z
    .number()
    .optional()
    .describe(
      "Optional starting line number (1-indexed, inclusive). Use with end_line to read a specific range.",
    ),
  end_line: z
    .number()
    .optional()
    .describe(
      "Optional ending line number (1-indexed, inclusive). Use with start_line to read a specific range.",
    ),
});

export class ReadFileTool extends BaseTool<typeof schema> {
  name = "read_file";
  description =
    "Read the contents of a text file. Use this to examine source code, configuration files, logs, or any text-based file.";
  schema = schema;

  protected async _call(
    runtime: ToolRuntime,
    input: z.infer<typeof schema>,
  ): Promise<string> {
    let content = await runtime.sandbox.readFile(input.path);
    if (!content) return "(empty)";
    if (input.start_line != null && input.end_line != null) {
      const lines = content.split("\n");
      content = lines.slice(input.start_line - 1, input.end_line).join("\n");
    }
    if (content.length > 12000) {
      const totalLines = content.split("\n").length;
      const truncated = truncateOutput(content);
      return `${truncated}\n\n[File has ${totalLines} lines. Use start_line and end_line to read specific ranges.]`;
    }
    return content;
  }
}
