import * as z from "zod";
import { defineTool, type FunctionTool } from "@code-artisan/agent";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";
import type { ShellSessionManager } from "../shell-session";

/** Expose a port inside the sandbox to a public URL (via E2B's getHost) and
 *  register it as the conversation's preview. The user's Preview panel picks
 *  it up immediately.
 *
 *  Intended flow:
 *  1. Start dev server with `bash(run_in_background: true)` → get session_id
 *  2. `bash_output` until the server prints its listen line
 *  3. `expose_port(port, session_id)` so the user sees it
 *
 *  Binding `session_id` lets the manager auto-clear the preview when the
 *  dev-server session exits (crash / kill / user-closed tab). */
export function createExposePortTool(opts: { manager: ShellSessionManager }): FunctionTool {
  return defineTool({
    name: "expose_port",
    description:
      "Expose a port from the sandbox to a public URL and set it as the user's preview. Call this AFTER starting a web server with `bash(run_in_background: true)` and confirming (via `bash_output`) that the server is listening. Pass the `session_id` of the server so the preview auto-clears if that session exits.",
    parameters: z.object({
      description: z.string().describe("Why you're exposing this port (e.g. 'Vite dev server')."),
      port: z.number().int().positive().max(65535).describe("The port the server is listening on inside the sandbox."),
      session_id: z
        .string()
        .optional()
        .describe(
          "The session id returned by `bash(run_in_background: true)` that owns this server. Recommended — lets the preview auto-clear when the session ends.",
        ),
    }),
    invoke: async ({ port, session_id }, ctx) => {
      try {
        const sandbox = ctx.sandbox as E2BSandbox;
        const host = await sandbox.sdk.getHost(port);
        const url = `https://${host}`;
        opts.manager.setPreview(sandbox.sandboxId, { url, port, sessionId: session_id });
        return `Port ${port} exposed at ${url}. The user will see it in their preview panel after switching to it.`;
      } catch (err) {
        return `Failed to expose port ${port}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}
