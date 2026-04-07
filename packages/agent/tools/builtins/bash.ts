import * as z from "zod";
import { defineTool, type FunctionTool } from "../tool";
import type { Sandbox } from "../../sandbox/base";

export function createBashTool(sandbox: Sandbox): FunctionTool {
  return defineTool({
    name: "bash",
    description:
      "Execute a bash command in a Linux sandbox environment. Use `python` to run Python code. Use this for short-lived commands only.",
    parameters: z.object({
      command: z
        .string()
        .describe("The bash command to execute. Always use absolute paths."),
    }),
    invoke: async ({ command }) => {
      const output = await sandbox.exec(command);
      return output || "(no output)";
    },
  });
}
