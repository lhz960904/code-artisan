import * as z from "zod";
import { defineTool, type FunctionTool } from "@code-artisan/agent";
import type { ShellSessionManager } from "../shell-session";

export function createKillShellTool(opts: { manager: ShellSessionManager }): FunctionTool {
  return defineTool({
    name: "kill_shell",
    description:
      "Terminate a background bash session started with `bash(run_in_background: true)`. Sends SIGKILL (only signal E2B supports).",
    parameters: z.object({
      description: z.string().describe("Why you're killing this session."),
      session_id: z.string().describe("Session id returned by `bash(run_in_background: true)`."),
    }),
    invoke: async ({ session_id }) => {
      const session = opts.manager.get(session_id);
      if (!session) return `session=${session_id} not found`;
      if (session.getStatus() === "exited") {
        return `session=${session_id} already exited (exit_code=${session.meta().exitCode ?? "?"})`;
      }
      await opts.manager.kill(session_id);
      return `session=${session_id} killed`;
    },
  });
}
