import * as z from "zod";
import { defineTool, type FunctionTool } from "@code-artisan/agent";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";
import type { ShellSessionManager } from "../shell-session";

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

/** Foreground `bash` via `sandbox.exec`, background via a PTY-backed
 *  ShellSession. Returns a session id the agent can poll with `bash_output`. */
export function createWebBashTool(opts: {
  conversationId: string;
  manager: ShellSessionManager;
}): FunctionTool {
  return defineTool({
    name: "bash",
    description:
      "Execute a bash command in the sandbox. Foreground by default — output is returned synchronously. Pass `run_in_background: true` for long-running processes (dev servers, watchers) — the call returns immediately with a session id, and output is captured in a PTY-backed session. Use `bash_output` to read pending output and check status; use `kill_shell` to stop it.",
    parameters: z.object({
      description: z
        .string()
        .describe("Why you're running this command. Always place `description` first."),
      command: z.string().describe("The bash command to execute."),
      run_in_background: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Start the command as a long-running background process and return immediately. Use ONLY for servers (`npm run dev`), watchers (`vitest --watch`), or tails. Do NOT use for one-shot commands where you need the output — those must run foreground.",
        ),
    }),
    invoke: async ({ command, run_in_background }, ctx) => {
      if (run_in_background) {
        try {
          const session = await opts.manager.create({
            conversationId: opts.conversationId,
            sandbox: ctx.sandbox as E2BSandbox,
            owner: "agent",
            command,
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
          });
          return `Started background session=${session.id} pid=${session.pid}. Use bash_output to read output and verify the process is running.`;
        } catch (err) {
          return `Failed to start background process: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      const { stdout, stderr, exitCode } = await ctx.sandbox.exec(command);
      const output = stdout + (stderr ? `\n${stderr}` : "");
      if (exitCode !== 0 && !output.trim()) return `(exit code ${exitCode})`;
      return output.trim() || "(no output)";
    },
  });
}
