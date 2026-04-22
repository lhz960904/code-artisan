import * as z from "zod";
import { defineTool } from "@code-artisan/agent";
import type { TerminalManager } from "./terminal-manager.js";

/**
 * All terminal-related AI tools in one class for cohesion.
 * Inject an instance's `.tools` array into createAgent().
 */
export class TerminalTools {
  constructor(private manager: TerminalManager) {}

  get tools() {
    return [
      this.terminalList,
      this.terminalCreate,
      this.terminalRead,
      this.terminalWrite,
      this.terminalClose,
      this.getPreviewUrl,
    ] as const;
  }

  private terminalList = defineTool({
    name: "terminal_list",
    description:
      "List all active terminal sessions with their label, status, exit code, and last 20 lines of output. Always call this at the start of a session to discover existing terminals before creating new ones.",
    parameters: z.object({}),
    invoke: async (_input, _ctx) => {
      const sessions = this.manager.list();
      if (sessions.length === 0) return "No terminal sessions.";
      return JSON.stringify(sessions, null, 2);
    },
  });

  private terminalCreate = defineTool({
    name: "terminal_create",
    description:
      "Create a named PTY terminal session. Optionally run an initial command immediately. Returns the session id. Use descriptive labels (e.g. 'dev-server', 'test', 'shell').",
    parameters: z.object({
      label: z.string().describe("Human-readable name for this terminal session."),
      command: z.string().optional().describe("Optional command to run immediately after creation (e.g. 'npm install')."),
    }),
    invoke: async ({ label, command }, _ctx) => {
      const id = await this.manager.create(label);
      if (command) {
        await this.manager.write(id, `${command}\n`);
      }
      return JSON.stringify({ id, label, message: `Terminal "${label}" created.` });
    },
  });

  private terminalRead = defineTool({
    name: "terminal_read",
    description:
      "Read the last N lines of output from a terminal session (ANSI codes stripped). Use this to check if a command succeeded, detect errors, or monitor progress.",
    parameters: z.object({
      id: z.string().describe("Terminal session id from terminal_list or terminal_create."),
      lines: z.number().int().positive().optional().default(50).describe("Number of trailing lines to return (default 50)."),
    }),
    invoke: async ({ id, lines }, _ctx) => {
      const output = this.manager.read(id, lines);
      return output || "(no output yet)";
    },
  });

  private terminalWrite = defineTool({
    name: "terminal_write",
    description:
      "Write text to a running terminal session. Use this to send commands, confirm prompts, or send control characters. To restart a server: first send Ctrl+C ('\\x03'), then send the new command.",
    parameters: z.object({
      id: z.string().describe("Terminal session id."),
      text: z.string().describe("Text to write. Use '\\n' to submit a command. Use '\\x03' for Ctrl+C."),
    }),
    invoke: async ({ id, text }, _ctx) => {
      await this.manager.write(id, text);
      return `Written to terminal "${id}".`;
    },
  });

  private terminalClose = defineTool({
    name: "terminal_close",
    description: "Close and destroy a terminal session.",
    parameters: z.object({
      id: z.string().describe("Terminal session id to close."),
    }),
    invoke: async ({ id }, _ctx) => {
      await this.manager.close(id);
      return `Terminal "${id}" closed.`;
    },
  });

  private getPreviewUrl = defineTool({
    name: "get_preview_url",
    description:
      "Get the public URL for a port exposed by the sandbox (E2B port forwarding). Use this after starting a dev server to get the URL for the user to preview.",
    parameters: z.object({
      port: z.number().int().describe("Port number the dev server is listening on (e.g. 3000, 5173)."),
    }),
    invoke: async ({ port }, _ctx) => {
      const url = await this.manager.getPreviewUrl(port);
      return url;
    },
  });
}
