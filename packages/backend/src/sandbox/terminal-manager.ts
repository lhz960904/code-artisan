import { randomUUID } from "node:crypto";
import type { Sandbox as E2BSDK } from "@e2b/code-interpreter";
import type { TerminalSessionInfo, TerminalStatus } from "@code-artisan/shared";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";

const OUTPUT_BUFFER_MAX_BYTES = 8 * 1024;
const ANSI_STRIP_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b[()][A-B0-1]|\r/g;

interface TerminalSession {
  id: string;
  label: string;
  pid: number;
  status: TerminalStatus;
  exitCode?: number;
  outputChunks: Uint8Array[];
  outputBytes: number;
  listeners: Set<(data: Uint8Array) => void>;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();

  constructor(private sdk: E2BSDK) {}

  async create(label: string): Promise<string> {
    const id = randomUUID();
    const encoder = new TextEncoder();

    const session: TerminalSession = {
      id,
      label,
      pid: 0,
      status: "idle",
      outputChunks: [],
      outputBytes: 0,
      listeners: new Set(),
    };
    this.sessions.set(id, session);

    const handle = await this.sdk.pty.create({
      cols: 220,
      rows: 50,
      cwd: SANDBOX_WORKSPACE_ROOT,
      onData: (data: Uint8Array) => {
        this._appendOutput(session, data);
        for (const listener of session.listeners) {
          listener(data);
        }
      },
    });

    session.pid = handle.pid;
    session.status = "running";

    handle.wait().then(
      (result) => {
        session.status = result.exitCode === 0 ? "exited" : "error";
        session.exitCode = result.exitCode;
        const msg = encoder.encode(`\r\n\x1b[33m[process exited with code ${result.exitCode}]\x1b[0m\r\n`);
        this._appendOutput(session, msg);
        for (const listener of session.listeners) listener(msg);
      },
      () => {
        session.status = "error";
        session.exitCode = -1;
      },
    );

    return id;
  }

  list(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => this._toInfo(s));
  }

  read(id: string, lines = 50): string {
    const session = this._get(id);
    const decoded = new TextDecoder().decode(this._getBuffer(session));
    const clean = decoded.replace(ANSI_STRIP_RE, "");
    const allLines = clean.split("\n");
    return allLines.slice(-lines).join("\n");
  }

  async write(id: string, text: string): Promise<void> {
    const session = this._get(id);
    if (session.status !== "running") {
      throw new Error(`Terminal "${id}" is not running (status: ${session.status})`);
    }
    await this.sdk.pty.sendInput(session.pid, new TextEncoder().encode(text));
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    const session = this._get(id);
    if (session.status !== "running") return;
    await this.sdk.pty.resize(session.pid, { cols, rows });
  }

  async close(id: string): Promise<void> {
    const session = this._get(id);
    if (session.status === "running") {
      await this.sdk.pty.kill(session.pid);
      session.status = "exited";
    }
    this.sessions.delete(id);
  }

  async getPreviewUrl(port: number): Promise<string> {
    return this.sdk.getHost(port);
  }

  /** Subscribe to raw PTY output for a session. Returns an unsubscribe fn. */
  subscribe(id: string, listener: (data: Uint8Array) => void): () => void {
    const session = this._get(id);
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  /** Get the full output buffer for replay on WebSocket connect. */
  getHistory(id: string): Uint8Array {
    const session = this._get(id);
    return this._getBuffer(session);
  }

  private _get(id: string): TerminalSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Terminal session "${id}" not found`);
    return session;
  }

  private _appendOutput(session: TerminalSession, data: Uint8Array): void {
    session.outputChunks.push(data);
    session.outputBytes += data.length;
    while (session.outputBytes > OUTPUT_BUFFER_MAX_BYTES && session.outputChunks.length > 1) {
      session.outputBytes -= session.outputChunks.shift()!.length;
    }
  }

  private _getBuffer(session: TerminalSession): Uint8Array {
    const out = new Uint8Array(session.outputBytes);
    let offset = 0;
    for (const chunk of session.outputChunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  private _toInfo(session: TerminalSession): TerminalSessionInfo {
    return {
      id: session.id,
      label: session.label,
      status: session.status,
      exitCode: session.exitCode,
      outputTail: this.read(session.id, 20),
    };
  }
}
