export interface SessionMeta {
  id: string;
  conversationId: string;
  pid: number;
  command: string;
  owner: "agent" | "user";
  cwd?: string;
  cols: number;
  rows: number;
  status: "running" | "exited";
  exitCode?: number;
  createdAt: string;
}

export type ServerMessage =
  | { op: "sessions"; sessions: SessionMeta[] }
  | { op: "snapshot"; sessionId: string; data: string; nextOffset: number }
  | { op: "data"; sessionId: string; data: string; offset: number }
  | { op: "exit"; sessionId: string; exitCode: number }
  | { op: "session_started"; meta: SessionMeta }
  | { op: "session_ended"; sessionId: string; exitCode: number }
  | { op: "created"; draftId?: string; meta: SessionMeta }
  | { op: "create_failed"; draftId?: string; message: string }
  | { op: "error"; message: string; cause?: string };

export type TerminalEvent = ServerMessage | { op: "open" } | { op: "close" };

export type TerminalWsListener = (event: TerminalEvent) => void;

type ClientMessage =
  | { op: "hello" }
  | { op: "attach"; sessionId: string; cols: number; rows: number; sinceOffset?: number }
  | { op: "detach"; sessionId: string }
  | { op: "create"; draftId?: string; command?: string; cols: number; rows: number; cwd?: string }
  | { op: "input"; sessionId: string; data: string }
  | { op: "resize"; sessionId: string; cols: number; rows: number }
  | { op: "kill"; sessionId: string };

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

function buildUrl(conversationId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/terminal/ws?conversationId=${encodeURIComponent(conversationId)}`;
}

export class TerminalWsClient {
  private ws: WebSocket | null = null;
  private readonly listeners = new Set<TerminalWsListener>();
  private closed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly outbox: ClientMessage[] = [];

  private readonly conversationId: string;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(buildUrl(this.conversationId));
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.emit({ op: "open" });
      while (this.outbox.length > 0) {
        const msg = this.outbox.shift()!;
        ws.send(JSON.stringify(msg));
      }
    });

    ws.addEventListener("message", (evt) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(typeof evt.data === "string" ? evt.data : String(evt.data)) as ServerMessage;
      } catch {
        return;
      }
      this.emit(parsed);
    });

    ws.addEventListener("close", () => {
      this.emit({ op: "close" });
      this.ws = null;
      if (this.closed) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
      this.reconnectAttempt += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });

    ws.addEventListener("error", () => {
      // close event handles reconnect; errors alone don't need action
    });
  }

  private emit(event: TerminalEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: TerminalWsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.outbox.push(msg);
    }
  }

  hello(): void {
    this.send({ op: "hello" });
  }

  attach(sessionId: string, cols: number, rows: number, sinceOffset?: number): void {
    this.send({ op: "attach", sessionId, cols, rows, sinceOffset });
  }

  detach(sessionId: string): void {
    this.send({ op: "detach", sessionId });
  }

  create(opts: { draftId?: string; command?: string; cols: number; rows: number; cwd?: string }): void {
    this.send({ op: "create", ...opts });
  }

  input(sessionId: string, data: string): void {
    this.send({ op: "input", sessionId, data });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.send({ op: "resize", sessionId, cols, rows });
  }

  kill(sessionId: string): void {
    this.send({ op: "kill", sessionId });
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}
