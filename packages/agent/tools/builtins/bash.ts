import * as z from "zod";
import { defineTool } from "../tool";

export const bashTool = defineTool({
  name: "bash",
  description:
    "Execute a bash command in the sandbox. Foreground by default — output is returned to you. Pass `run_in_background: true` for long-running processes (dev servers, watchers, tails); their output streams to the user's terminal panel and the call returns immediately with a PID.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to execute the command. Always place `description` as the first parameter."),
    command: z
      .string()
      .describe("The bash command to execute."),
    run_in_background: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Start the command as a detached long-running process and return immediately. Use ONLY for long-running processes such as dev servers (`npm run dev`), watchers (`vitest --watch`), or tails. Do NOT use for one-shot commands where you need the output — those must run foreground.",
      ),
  }),
  invoke: async ({ command, run_in_background }, ctx) => {
    if (run_in_background) {
      try {
        const handle = await ctx.sandbox.spawn(command);
        return `Started in background. PID: ${handle.pid}. Output is streaming to the user's terminal panel.`;
      } catch (err) {
        return `Failed to start background process: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const { stdout, stderr, exitCode } = await ctx.sandbox.exec(command);
    const output = stdout + (stderr ? `\n${stderr}` : "");

    if (exitCode !== 0 && !output.trim()) {
      return `(exit code ${exitCode})`;
    }

    return output.trim() || "(no output)";
  },
});
