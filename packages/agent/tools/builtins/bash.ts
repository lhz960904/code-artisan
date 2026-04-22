import * as z from "zod";
import { defineTool } from "../tool";

export const bashTool = defineTool({
  name: "bash",
  description: "Execute a bash command in the sandbox. Output is returned synchronously.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to execute the command. Always place `description` as the first parameter."),
    command: z.string().describe("The bash command to execute."),
  }),
  invoke: async ({ command }, ctx) => {
    const { stdout, stderr, exitCode } = await ctx.sandbox.exec(command);
    const output = stdout + (stderr ? `\n${stderr}` : "");

    if (exitCode !== 0 && !output.trim()) {
      return `(exit code ${exitCode})`;
    }

    return output.trim() || "(no output)";
  },
});
