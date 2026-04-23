import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTheme } from "@/contexts/theme-context";
import { type SessionMeta } from "@/lib/conversation-ws";
import {
  useConversationWs,
  type DisplaySession,
} from "@/components/workspace/conversation-ws-context";
import { Plus, X, ChevronDown, ChevronUp, TerminalSquare, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_USER_TERMINALS = 3;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

const TERMINAL_THEMES = {
  dark: {
    background: "#1E1E1E",
    foreground: "#E0E0E0",
    cursor: "#E0E0E0",
    cursorAccent: "#1E1E1E",
    selectionBackground: "#264F78",
    selectionForeground: "#FFFFFF",
    black: "#1E1E1E",
    red: "#F44747",
    green: "#6EC85A",
    yellow: "#E5C07B",
    blue: "#61AFEF",
    magenta: "#C678DD",
    cyan: "#56B6C2",
    white: "#E0E0E0",
    brightBlack: "#5C6370",
    brightRed: "#F44747",
    brightGreen: "#6EC85A",
    brightYellow: "#E5C07B",
    brightBlue: "#61AFEF",
    brightMagenta: "#C678DD",
    brightCyan: "#56B6C2",
    brightWhite: "#FFFFFF",
  },
  light: {
    background: "#FFFFFF",
    foreground: "#383A42",
    cursor: "#383A42",
    cursorAccent: "#FFFFFF",
    selectionBackground: "#ADD6FF",
    selectionForeground: "#383A42",
    black: "#383A42",
    red: "#E45649",
    green: "#50A14F",
    yellow: "#C18401",
    blue: "#4078F2",
    magenta: "#A626A4",
    cyan: "#0184BC",
    white: "#FAFAFA",
    brightBlack: "#A0A1A7",
    brightRed: "#E45649",
    brightGreen: "#50A14F",
    brightYellow: "#C18401",
    brightBlue: "#4078F2",
    brightMagenta: "#A626A4",
    brightCyan: "#0184BC",
    brightWhite: "#FFFFFF",
  },
} as const;

function getTerminalTheme(mode: "dark" | "light") {
  return TERMINAL_THEMES[mode];
}

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  observer: ResizeObserver;
  attached: boolean;
}

interface TerminalPanelProps {
  conversationId: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TerminalPanel({ conversationId, collapsed, onToggleCollapse }: TerminalPanelProps) {
  const { client, sessions, setSessions, subscribe } = useConversationWs();
  const [activeId, setActiveId] = useState<string | null>(null);
  const instancesRef = useRef<Map<string, TerminalInstance>>(new Map());
  const containersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const { resolved } = useTheme();
  const resolvedRef = useRef(resolved);
  // eslint-disable-next-line react-hooks/refs
  resolvedRef.current = resolved;
  const clientRef = useRef(client);
  // eslint-disable-next-line react-hooks/refs
  clientRef.current = client;

  // ---- Per-mount subscription: panel-local concerns only ----
  // Sessions list / session_started / session_ended / created list-update
  // are owned by ConversationWsProvider. Here we only handle:
  //   - data/snapshot → write into the (only-while-mounted) xterm instances
  //   - created → swap activeId from draftId to the real session id
  //   - create_failed → clear activeId if it was the failed draft
  useEffect(() => {
    return subscribe((event) => {
      switch (event.op) {
        case "snapshot": {
          const inst = instancesRef.current.get(event.sessionId);
          if (inst && event.data) inst.terminal.write(event.data);
          break;
        }
        case "data": {
          const inst = instancesRef.current.get(event.sessionId);
          if (inst) inst.terminal.write(event.data);
          break;
        }
        case "created": {
          const { draftId, meta } = event;
          setActiveId((current) => (current && draftId && current === draftId ? meta.id : current));
          break;
        }
        case "create_failed":
          if (event.draftId) {
            setActiveId((current) => (current === event.draftId ? null : current));
          }
          break;
        default:
          break;
      }
    });
  }, [subscribe]);

  // ---- Auto-select an active tab when one becomes available / disappears ----
  useEffect(() => {
    if (sessions.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !sessions.some((s) => s.id === activeId)) {
      setActiveId(sessions[0].id);
    }
  }, [sessions, activeId]);

  // ---- Drop xterm instances for sessions that disappeared from the server ----
  useEffect(() => {
    const alive = new Set(sessions.map((s) => s.id));
    for (const [id, inst] of instancesRef.current) {
      if (alive.has(id)) continue;
      inst.observer.disconnect();
      inst.terminal.dispose();
      instancesRef.current.delete(id);
      containersRef.current.delete(id);
    }
  }, [sessions]);

  // ---- Mount/reattach an xterm instance per session container ----
  const initInstance = useCallback((session: SessionMeta, container: HTMLDivElement | null) => {
    if (!container) return;
    const existing = instancesRef.current.get(session.id);
    if (existing) {
      if (containersRef.current.get(session.id) !== container) {
        containersRef.current.set(session.id, container);
        container.innerHTML = "";
        existing.terminal.open(container);
        existing.fitAddon.fit();
      }
      return;
    }

    const term = new Terminal({
      theme: getTerminalTheme(resolvedRef.current),
      fontSize: 12,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, monospace",
      cursorBlink: true,
      disableStdin: false,
      scrollback: 5000,
      // PTY emits CRLF natively — don't auto-translate.
      convertEol: false,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    client?.attach(session.id, term.cols, term.rows);
    term.onData((data) => client?.input(session.id, data));

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      client?.resize(session.id, term.cols, term.rows);
    });
    observer.observe(container);

    instancesRef.current.set(session.id, { terminal: term, fitAddon, observer, attached: true });
    containersRef.current.set(session.id, container);
  }, [client]);

  // ---- Refit the active terminal when tab/collapsed state changes ----
  useEffect(() => {
    if (!activeId) return;
    const inst = instancesRef.current.get(activeId);
    if (!inst) return;
    requestAnimationFrame(() => inst.fitAddon.fit());
  }, [activeId, collapsed]);

  // ---- Theme repaint ----
  useEffect(() => {
    const theme = getTerminalTheme(resolved);
    for (const inst of instancesRef.current.values()) {
      requestAnimationFrame(() => {
        inst.terminal.options.theme = theme;
        inst.terminal.refresh(0, inst.terminal.rows - 1);
      });
    }
  }, [resolved]);

  // ---- Final cleanup on unmount ----
  //
  // Send `detach` for every attached session so the backend drops its
  // subscription and forgets this client had ever attached. Without this,
  // on remount (e.g. switching Preview → Code tabs) the backend short-circuits
  // the new attach (conversation-ws.ts: `perSession.has(sessionId)` guard) and
  // the freshly-created xterm never receives a snapshot — terminal looks blank.
  useEffect(() => {
    return () => {
      for (const [id, inst] of instancesRef.current) {
        inst.observer.disconnect();
        inst.terminal.dispose();
        clientRef.current?.detach(id);
      }
      instancesRef.current.clear();
      containersRef.current.clear();
    };
  }, []);

  // ---- User actions ----
  const userTabCount = sessions.filter((s) => s.owner === "user").length;

  const addTerminal = useCallback(() => {
    if (userTabCount >= MAX_USER_TERMINALS) return;
    const draftId = crypto.randomUUID();
    const draft: DisplaySession = {
      id: draftId,
      conversationId,
      pid: 0,
      command: "bash -l",
      owner: "user",
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => [...prev, draft]);
    setActiveId(draftId);
    client?.create({ draftId, cols: DEFAULT_COLS, rows: DEFAULT_ROWS });
  }, [userTabCount, conversationId, client, setSessions]);

  const removeTerminal = useCallback(
    (id: string) => {
      const session = sessions.find((s) => s.id === id);
      if (!session) return;
      // Always drop the tab locally on click. The xterm instance cleanup runs
      // from the `sessions` diff effect. If it's a running server-backed
      // session we fire-and-forget the kill; the server's `session_ended`
      // arrives later and becomes a no-op since the id is already gone.
      if (session.status === "running") client?.kill(id);
      else if (session.status !== "pending") client?.detach(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setActiveId((current) => (current === id ? null : current));
    },
    [sessions, client, setSessions],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
        {sessions.length === 0 && (
          <div className="px-3 py-1 text-xs text-muted-foreground">No active sessions</div>
        )}

        {sessions.map((session) => (
          <TabItem
            key={session.id}
            id={session.id}
            label={tabLabel(session)}
            isActive={session.id === activeId}
            status={session.status}
            owner={session.owner}
            onClick={setActiveId}
            onClose={removeTerminal}
          />
        ))}

        {userTabCount < MAX_USER_TERMINALS && (
          <button
            className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
            onClick={addTerminal}
            title="New Terminal"
          >
            <Plus className="size-3.5" />
          </button>
        )}

        {onToggleCollapse && (
          <button
            className="ml-auto flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
            onClick={onToggleCollapse}
            title="Toggle Terminal"
          >
            <ChevronDown className="size-4" />
          </button>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden bg-card p-2">
        {sessions.map((session) =>
          session.status === "pending" ? (
            <div
              key={session.id}
              className={cn(
                "absolute inset-2 flex items-center justify-center gap-2 text-sm text-muted-foreground",
                session.id === activeId ? "flex" : "hidden",
              )}
            >
              <Loader2 className="size-4 animate-spin" />
              <span>Starting session…</span>
            </div>
          ) : (
            <div
              key={session.id}
              ref={(el) => initInstance(session as SessionMeta, el)}
              className={cn("absolute inset-2", session.id === activeId ? "block" : "hidden")}
            />
          ),
        )}
      </div>
    </div>
  );
}

function tabLabel(session: DisplaySession): string {
  if (session.status === "pending") return "Starting…";
  if (session.owner === "user") return `Terminal ${session.pid}`;
  // Truncate long agent commands in the tab label.
  const cmd = session.command.length > 24 ? `${session.command.slice(0, 21)}…` : session.command;
  return cmd || "agent";
}

function TabItem({
  id,
  label,
  isActive,
  status,
  owner,
  onClick,
  onClose,
}: {
  id: string;
  label: string;
  isActive: boolean;
  status: DisplaySession["status"];
  owner: "agent" | "user";
  onClick: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const isPending = status === "pending";
  const BaseIcon = owner === "agent" ? Zap : TerminalSquare;
  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-full px-3 py-1 text-xs cursor-pointer transition-colors",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
      onClick={() => onClick(id)}
    >
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <BaseIcon className={cn("size-3.5", owner === "agent" && "text-[#E5C07B]")} />
      )}
      <span>{label}</span>
      {owner !== "agent" && (
        <button
          className="ml-0.5 rounded transition-opacity hover:bg-accent cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onClose(id);
          }}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/** Toggle button shown at the bottom-right when the terminal panel is collapsed. */
export function TerminalToggleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="flex items-center gap-1.5 rounded-t-md border border-b-0 border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
      onClick={onClick}
    >
      <TerminalSquare className="size-3.5" />
      <span>Terminal</span>
      <ChevronUp className="size-3.5" />
    </button>
  );
}
