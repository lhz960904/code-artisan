import * as z from "zod";
import { BaseTool, type ToolRuntime } from "../base.js";

const schema = z.object({
  description: z
    .string()
    .describe(
      "Explain why you are running this command in short words. ALWAYS PROVIDE THIS PARAMETER FIRST.",
    ),
  command: z
    .string()
    .describe(
      "The bash command to execute. Always use absolute paths for files and directories.",
    ),
});

export class BashTool extends BaseTool<typeof schema> {
  name = "bash";
  description =
    "Execute a bash command in a Linux sandbox environment. Use `python` to run Python code. Use this for short-lived commands only.";
  schema = schema;

  protected async _call(
    runtime: ToolRuntime,
    input: z.infer<typeof schema>,
  ): Promise<string> {
    const output = await runtime.sandbox.executeCommand(input.command);
    return output || "(no output)";
  }
}
