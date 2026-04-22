export type SessionOwner = "agent" | "user";

export type SessionStatus = "running" | "exited";

export interface SessionMeta {
  id: string;
  conversationId: string;
  pid: number;
  command: string;
  owner: SessionOwner;
  cwd?: string;
  cols: number;
  rows: number;
  status: SessionStatus;
  exitCode?: number;
  createdAt: string;
}

export interface TailResult {
  data: string;
  /** Cumulative byte offset of the end of `data`. Pass back as `sinceOffset`
   *  on the next call to continue reading. */
  nextOffset: number;
  /** Lowest offset currently in the ring buffer; anything older was dropped. */
  oldestOffset: number;
  /** True if the caller's `sinceOffset` was older than the ring buffer could
   *  serve, so some output is missing from the returned `data`. */
  truncated: boolean;
  status: SessionStatus;
  exitCode?: number;
}

export type SessionEvent =
  | { kind: "data"; data: string; offset: number }
  | { kind: "exit"; exitCode: number };

export type SessionListener = (event: SessionEvent) => void;

export type Unsubscribe = () => void;
