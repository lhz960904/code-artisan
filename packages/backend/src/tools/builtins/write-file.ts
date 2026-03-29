import * as z from "zod";
import { BaseTool, type ToolRuntime } from "../base.js";

const schema = z.object({
  description: z
    .string()
    .describe(
      "Explain why you are writing to this file in short words. ALWAYS PROVIDE THIS PARAMETER FIRST.",
    ),
  path: z
    .string()
    .describe(
      "The absolute path to the file to write to. ALWAYS PROVIDE THIS PARAMETER SECOND.",
    ),
  content: z
    .string()
    .describe(
      "The content to write to the file. ALWAYS PROVIDE THIS PARAMETER THIRD.",
    ),
  append: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to append the content to the file instead of overwriting."),
});

export class WriteFileTool extends BaseTool<typeof schema> {
  name = "write_file";
  description = "Write text content to a file. Creates directories as needed.";
  schema = schema;

  protected async _call(
    runtime: ToolRuntime,
    input: z.infer<typeof schema>,
  ): Promise<string> {
    await runtime.sandbox.writeFile(input.path, input.content, input.append);
    return "OK";
  }
}
