import * as z from "zod";
import { BaseTool, type ToolRuntime } from "../base.js";

const schema = z.object({
  description: z
    .string()
    .describe(
      "Explain why you are replacing the substring in short words. ALWAYS PROVIDE THIS PARAMETER FIRST.",
    ),
  path: z
    .string()
    .describe(
      "The absolute path to the file. ALWAYS PROVIDE THIS PARAMETER SECOND.",
    ),
  old_str: z
    .string()
    .describe(
      "The substring to replace. ALWAYS PROVIDE THIS PARAMETER THIRD.",
    ),
  new_str: z
    .string()
    .describe(
      "The new substring. ALWAYS PROVIDE THIS PARAMETER FOURTH.",
    ),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to replace all occurrences. If false, only the first occurrence will be replaced.",
    ),
});

export class StrReplaceTool extends BaseTool<typeof schema> {
  name = "str_replace";
  description =
    "Replace a substring in a file with another substring. If replace_all is false (default), the substring to replace must appear exactly once in the file.";
  schema = schema;

  protected async _call(
    runtime: ToolRuntime,
    input: z.infer<typeof schema>,
  ): Promise<string> {
    let content = await runtime.sandbox.readFile(input.path);
    if (!content) return "OK";

    if (!content.includes(input.old_str)) {
      return `Error: String to replace not found in file: ${input.path}`;
    }

    if (input.replace_all) {
      content = content.replaceAll(input.old_str, input.new_str);
    } else {
      content = content.replace(input.old_str, input.new_str);
    }

    await runtime.sandbox.writeFile(input.path, content);
    return "OK";
  }
}
