import * as z from "zod";
import { tool } from "../tool";

export const bashTool = tool({
  name: "bash",
  description:
    "Execute a bash command in a Linux sandbox environment. Use `python` to run Python code. Use this for short-lived commands only.",
  parameters: z.object({
    command: z
      .string()
      .describe("The bash command to execute. Always use absolute paths."),
  }),
  maxOutputChars: 12000,
  execute: async ({ command }, { sandbox }) => {
    const output = await sandbox.exec(command);
    return output || "(no output)";
  },
});
