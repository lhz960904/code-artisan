import * as z from "zod";
import { defineTool, type FunctionTool } from "@code-artisan/agent";
import type { ShellSessionManager } from "../shell-session";

const DEFAULT_MAX_BYTES = 4096;
const HARD_MAX_BYTES = 16 * 1024;

/** Read pending output and status for a background session started with
 *  `bash(run_in_background: true)`. Caller can pass `since_offset` for
 *  incremental reads, or omit for a tail snapshot. */
export function createBashOutputTool(opts: { manager: ShellSessionManager }): FunctionTool {
  return defineTool({
    name: "bash_output",
    description:
      "Read output and status of a background bash session. Call this after `bash(run_in_background: true)` to verify the process booted (e.g. dev server) or diagnose why it exited. Omit `since_offset` to get a tail snapshot; pass it back to get only new output since the last call.",
    parameters: z.object({
      description: z.string().describe("Why you're reading this session's output."),
      session_id: z.string().describe("Session id returned by `bash(run_in_background: true)`."),
      since_offset: z
        .number()
        .int()
        .optional()
        .describe("Cumulative byte offset from the previous `next_offset`. Omit for a tail snapshot."),
      max_bytes: z
        .number()
        .int()
        .positive()
        .max(HARD_MAX_BYTES)
        .optional()
        .default(DEFAULT_MAX_BYTES)
        .describe(`Maximum bytes to return. Defaults to ${DEFAULT_MAX_BYTES}, hard-capped at ${HARD_MAX_BYTES}.`),
    }),
    invoke: async ({ session_id, since_offset, max_bytes }) => {
      const result = opts.manager.readTail(session_id, since_offset, max_bytes);
      if (!result) return `session=${session_id} not found (already cleaned up or never existed)`;

      const header = [
        `session=${session_id}`,
        `status=${result.status}${result.exitCode !== undefined ? ` exit_code=${result.exitCode}` : ""}`,
        `next_offset=${result.nextOffset}`,
        result.truncated ? "truncated=true (some older output dropped from ring buffer)" : null,
      ]
        .filter(Boolean)
        .join(" ");

      const body = result.data || "(no new output)";
      return `${header}\n---\n${body}`;
    },
  });
}
