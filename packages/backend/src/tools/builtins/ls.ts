import * as z from "zod";
import { BaseTool, truncateOutput, type ToolRuntime } from "../base.js";

const schema = z.object({
  description: z
    .string()
    .describe(
      "Explain why you are listing this directory in short words. ALWAYS PROVIDE THIS PARAMETER FIRST.",
    ),
  path: z
    .string()
    .describe("The absolute path to the directory to list."),
});

export class LsTool extends BaseTool<typeof schema> {
  name = "ls";
  description =
    "List the contents of a directory up to 2 levels deep in tree format.";
  schema = schema;

  protected async _call(
    runtime: ToolRuntime,
    input: z.infer<typeof schema>,
  ): Promise<string> {
    const entries = await runtime.sandbox.listDir(input.path);
    if (entries.length === 0) return "(empty)";
    return truncateOutput(entries.join("\n"));
  }
}
