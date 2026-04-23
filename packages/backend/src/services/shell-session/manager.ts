import { randomUUID } from "node:crypto";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";
import { ShellSession } from "./session";
import type { SessionListener, SessionMeta, SessionOwner, TailResult, Unsubscribe } from "./types";

const DEFAULT_BUFFER_BYTES = 64 * 1024;
const DEFAULT_SHELL_COMMAND = "bash -l";

export interface CreateSessionOptions {
  conversationId: string;
  sandbox: E2BSandbox;
  owner: SessionOwner;
  /** Omit for an interactive shell (starts `bash -l`). Pass a full command
   *  (`npm run dev`) for a one-shot long-running process. */
  command?: string;
  cols: number;
  rows: number;
  cwd?: string;
  env?: Record<string, string>;
}

export type ConversationEvent =
  | { kind: "session_started"; meta: SessionMeta }
  | { kind: "session_ended"; sessionId: string; exitCode: number };

export type ConversationListener = (event: ConversationEvent) => void;

/** Stored under the sandbox id, not the conversation id, so the URL lives
 *  exactly as long as the sandbox does — survives page reloads (the chat
 *  page's conversation-detail query reads it back), dies whenever the
 *  sandbox is evicted/expired. */
export interface PreviewState {
  url: string;
  port: number;
  /** Owning shell session — preview auto-clears when this session ends. */
  sessionId?: string;
}

export class ShellSessionManager {
  private readonly sessions = new Map<string, ShellSession>();
  private readonly byConversation = new Map<string, Set<string>>();
  private readonly conversationListeners = new Map<string, Set<ConversationListener>>();
  private readonly previews = new Map<string, PreviewState>();

  async create(opts: CreateSessionOptions): Promise<ShellSession> {
    const id = randomUUID();
    const command = opts.command ?? DEFAULT_SHELL_COMMAND;
    const sandboxId = opts.sandbox.sandboxId;

    let session: ShellSession | null = null;

    const pty = await opts.sandbox.pty.create({
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: opts.env,
      onData: (chunk) => session?.onData(chunk),
      onExit: (exitCode) => {
        if (!session) return;
        session.onExit(exitCode);
        this.emitConversation(session.conversationId, {
          kind: "session_ended",
          sessionId: session.id,
          exitCode,
        });
        const preview = this.previews.get(sandboxId);
        if (preview?.sessionId === session.id) this.clearPreview(sandboxId);
        this.remove(session.conversationId, session.id);
      },
    });

    // For `command`-mode sessions the user isn't typing — pipe it into the PTY
    // so the shell runs it then exits. The `\n` sentinel triggers execution.
    // Interactive sessions (command omitted) skip this and land at the prompt.
    const isInteractive = opts.command === undefined;

    session = new ShellSession({
      id,
      conversationId: opts.conversationId,
      command,
      owner: opts.owner,
      cwd: opts.cwd,
      cols: opts.cols,
      rows: opts.rows,
      pty,
      bufferCapacityBytes: DEFAULT_BUFFER_BYTES,
    });

    this.sessions.set(id, session);
    let ids = this.byConversation.get(opts.conversationId);
    if (!ids) {
      ids = new Set();
      this.byConversation.set(opts.conversationId, ids);
    }
    ids.add(id);

    if (!isInteractive) {
      // Fire-and-forget: send the command line into the PTY.
      // If this races against onExit (instant failure), sendInput silently no-ops.
      void pty.sendInput(`${command}\n`).catch((err) => {
        console.error(`[ShellSessionManager] sendInput initial command failed:`, err);
      });
    }

    this.emitConversation(opts.conversationId, { kind: "session_started", meta: session.meta() });
    return session;
  }

  subscribeConversation(conversationId: string, listener: ConversationListener): Unsubscribe {
    let set = this.conversationListeners.get(conversationId);
    if (!set) {
      set = new Set();
      this.conversationListeners.set(conversationId, set);
    }
    set.add(listener);
    return () => {
      const current = this.conversationListeners.get(conversationId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.conversationListeners.delete(conversationId);
    };
  }

  private emitConversation(conversationId: string, event: ConversationEvent): void {
    const listeners = this.conversationListeners.get(conversationId);
    if (!listeners) return;
    for (const listener of listeners) listener(event);
  }

  get(sessionId: string): ShellSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  list(conversationId: string): SessionMeta[] {
    const ids = this.byConversation.get(conversationId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.sessions.get(id)?.meta())
      .filter((m): m is SessionMeta => !!m);
  }

  readTail(sessionId: string, sinceOffset?: number, maxBytes?: number): TailResult | null {
    return this.sessions.get(sessionId)?.readTail(sinceOffset, maxBytes) ?? null;
  }

  async sendInput(sessionId: string, data: string): Promise<void> {
    await this.sessions.get(sessionId)?.sendInput(data);
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    await this.sessions.get(sessionId)?.resize(cols, rows);
  }

  async kill(sessionId: string): Promise<void> {
    await this.sessions.get(sessionId)?.kill();
  }

  subscribe(sessionId: string, listener: SessionListener): Unsubscribe {
    const session = this.sessions.get(sessionId);
    if (!session) return () => undefined;
    return session.subscribe(listener);
  }

  /** Evict a session from the maps (called on PTY exit). Kept public so the
   *  WS gateway can force-remove a zombie if needed. */
  remove(conversationId: string, sessionId: string): void {
    this.sessions.delete(sessionId);
    const ids = this.byConversation.get(conversationId);
    if (!ids) return;
    ids.delete(sessionId);
    if (ids.size === 0) this.byConversation.delete(conversationId);
  }

  // ---- Preview ----
  // Keyed by sandboxId — preview lives as long as the sandbox does. No live
  // broadcast: the chat page picks up changes by re-fetching conversation
  // detail on mount and at end-of-turn.

  setPreview(sandboxId: string, state: PreviewState): void {
    this.previews.set(sandboxId, state);
  }

  clearPreview(sandboxId: string): void {
    this.previews.delete(sandboxId);
  }

  getPreview(sandboxId: string): PreviewState | null {
    return this.previews.get(sandboxId) ?? null;
  }
}

let singleton: ShellSessionManager | null = null;

export function getShellSessionManager(): ShellSessionManager {
  if (!singleton) singleton = new ShellSessionManager();
  return singleton;
}
