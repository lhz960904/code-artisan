import * as z from "zod";
import { defineTool } from "../tool";

export const bashTool = defineTool({
  name: "bash",
  description:
    "Execute a bash command in the local environment. Use this for short-lived commands only.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to execute the command. Always place `description` as the first parameter."),
    command: z
      .string()
      .describe("The bash command to execute."),
  }),
  invoke: async ({ command }, _ctx) => {
    const proc = Bun.spawn(["bash", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    const output = stdout + (stderr ? `\n${stderr}` : "");

    if (exitCode !== 0 && !output.trim()) {
      return `(exit code ${exitCode})`;
    }

    return output.trim() || "(no output)";
  },
});
