import type { PtyHandle } from "../../sandbox/e2b-sandbox";
import { RingBuffer } from "./ring-buffer";
import type { SessionListener, SessionMeta, SessionStatus, TailResult, Unsubscribe } from "./types";

const DEFAULT_TAIL_BYTES = 4096;

export class ShellSession {
  readonly id: string;
  readonly conversationId: string;
  readonly command: string;
  readonly owner: SessionMeta["owner"];
  readonly cwd?: string;
  readonly createdAt: string;

  private cols: number;
  private rows: number;
  private status: SessionStatus = "running";
  private exitCode?: number;
  private readonly buffer: RingBuffer;
  private readonly listeners = new Set<SessionListener>();
  private readonly pty: PtyHandle;

  constructor(init: {
    id: string;
    conversationId: string;
    command: string;
    owner: SessionMeta["owner"];
    cwd?: string;
    cols: number;
    rows: number;
    pty: PtyHandle;
    bufferCapacityBytes: number;
  }) {
    this.id = init.id;
    this.conversationId = init.conversationId;
    this.command = init.command;
    this.owner = init.owner;
    this.cwd = init.cwd;
    this.cols = init.cols;
    this.rows = init.rows;
    this.createdAt = new Date().toISOString();
    this.buffer = new RingBuffer(init.bufferCapacityBytes);
    this.pty = init.pty;
  }

  get pid(): number {
    return this.pty.pid;
  }

  meta(): SessionMeta {
    return {
      id: this.id,
      conversationId: this.conversationId,
      pid: this.pid,
      command: this.command,
      owner: this.owner,
      cwd: this.cwd,
      cols: this.cols,
      rows: this.rows,
      status: this.status,
      exitCode: this.exitCode,
      createdAt: this.createdAt,
    };
  }

  /** Called by the manager for each PTY data chunk. Appends to ring and fans out. */
  onData(data: string): void {
    const offset = this.buffer.endOffset();
    this.buffer.append(data);
    for (const listener of this.listeners) {
      listener({ kind: "data", data, offset });
    }
  }

  /** Called by the manager when the underlying PTY exits. */
  onExit(exitCode: number): void {
    if (this.status === "exited") return;
    this.status = "exited";
    this.exitCode = exitCode;
    for (const listener of this.listeners) {
      listener({ kind: "exit", exitCode });
    }
    this.listeners.clear();
  }

  readTail(sinceOffset?: number, maxBytes: number = DEFAULT_TAIL_BYTES): TailResult {
    if (sinceOffset === undefined) {
      const snap = this.buffer.readTail(maxBytes);
      return {
        data: snap.data,
        nextOffset: snap.endOffset,
        oldestOffset: this.buffer.oldestOffset(),
        truncated: false,
        status: this.status,
        exitCode: this.exitCode,
      };
    }
    const { data, nextOffset, truncated } = this.buffer.readFrom(sinceOffset, maxBytes);
    return {
      data,
      nextOffset,
      oldestOffset: this.buffer.oldestOffset(),
      truncated,
      status: this.status,
      exitCode: this.exitCode,
    };
  }

  async sendInput(data: string): Promise<void> {
    if (this.status !== "running") return;
    await this.pty.sendInput(data);
  }

  async resize(cols: number, rows: number): Promise<void> {
    this.cols = cols;
    this.rows = rows;
    if (this.status !== "running") return;
    await this.pty.resize(cols, rows);
  }

  async kill(): Promise<void> {
    if (this.status !== "running") return;
    await this.pty.kill();
  }

  subscribe(listener: SessionListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): SessionStatus {
    return this.status;
  }
}
