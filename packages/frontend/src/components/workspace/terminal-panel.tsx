/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTheme } from "@/contexts/theme-context";
import { terminalBus } from "@/lib/terminal-bus";
import { Plus, X, ChevronDown, ChevronUp, TerminalSquare, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_TERMINALS = 3;

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
  id: number;
  terminal: Terminal;
  fitAddon: FitAddon;
  inputBuffer: string;
}

interface TerminalPanelProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TerminalPanel({ collapsed, onToggleCollapse }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const instancesRef = useRef<Map<number, TerminalInstance>>(new Map());
  const containersRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const { resolved } = useTheme();
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;

  const addTerminal = useCallback(() => {
    if (tabs.length >= MAX_TERMINALS) return;
    console.log("addTerminal", tabs, Math.max(...tabs));
    const id = Math.max(...tabs, 0) + 1;
    setTabs((prev) => [...prev, id]);
    setActiveTab(id);
  }, [tabs]);

  const removeTerminal = useCallback(
    (id: number) => {
      const instance = instancesRef.current.get(id);
      if (instance) {
        instance.terminal.dispose();
        instancesRef.current.delete(id);
      }
      containersRef.current.delete(id);
      const nextTabs = tabs.filter((t) => t !== id);
      if (activeTab === id) {
        setActiveTab(nextTabs[nextTabs.length - 1]);
      }
      setTabs(nextTabs);
    },
    [activeTab, tabs, setActiveTab],
  );

  // init xterm instance
  const initTerminal = useCallback((tabId: number, container: HTMLDivElement | null) => {
    if (!container) return;
    // already initialized, skip
    if (instancesRef.current.has(tabId)) {
      // container may change, reattach
      const inst = instancesRef.current.get(tabId)!;
      if (containersRef.current.get(tabId) !== container) {
        containersRef.current.set(tabId, container);
        container.innerHTML = "";
        inst.terminal.open(container);
        inst.fitAddon.fit();
      }
      return;
    }

    containersRef.current.set(tabId, container);

    const term = new Terminal({
      theme: getTerminalTheme(resolvedRef.current),
      fontSize: 12,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, monospace",
      cursorBlink: true,
      disableStdin: false,
      scrollback: 5000,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    const instance: TerminalInstance = {
      id: tabId,
      terminal: term,
      fitAddon: fit,
      inputBuffer: "",
    };

    // 处理用户输入
    term.onData((data) => {
      if (data === "\r") {
        // 回车 — 回调留空，后续可接入 shell
        // const _command = instance.inputBuffer;
        instance.inputBuffer = "";
        term.write("\r\n");
        // TODO: onCommand?.(_command)
      } else if (data === "\x7f") {
        // 退格
        if (instance.inputBuffer.length > 0) {
          instance.inputBuffer = instance.inputBuffer.slice(0, -1);
          term.write("\b \b");
        }
      } else if (data >= " " || data === "\t") {
        instance.inputBuffer += data;
        term.write(data);
      }
    });

    instancesRef.current.set(tabId, instance);

    // ResizeObserver
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);

    // 监听 terminalBus 事件 — 第一个 tab (id=0) 接收所有事件
    if (tabId === 0) {
      const unsubscribe = terminalBus.subscribe((event) => {
        switch (event.type) {
          case "start":
            term.writeln(`\x1b[36m$ ${event.command}\x1b[0m`);
            break;
          case "chunk":
            term.write(event.data);
            break;
          case "exit":
            if (event.exitCode !== 0) {
              term.writeln(`\r\n\x1b[31m[process exited with code ${event.exitCode}]\x1b[0m`);
            }
            break;
          case "clear":
            term.clear();
            break;
        }
      });

      // 存储 unsubscribe 用于清理
      (instance as any)._unsubscribe = unsubscribe;
      (instance as any)._observer = observer;
    } else {
      (instance as any)._observer = observer;
    }
  }, []);

  // change tab fit
  useEffect(() => {
    const instance = instancesRef.current.get(activeTab);
    if (instance) {
      requestAnimationFrame(() => instance.fitAddon.fit());
    }
  }, [activeTab, collapsed]);

  // theme change update all terminals
  useEffect(() => {
    const theme = getTerminalTheme(resolved);
    instancesRef.current.forEach((inst) => {
      const id = requestAnimationFrame(() => {
        inst.terminal.options.theme = theme;
        inst.terminal.refresh(0, inst.terminal.rows - 1);
      });
      return () => cancelAnimationFrame(id);
    });
  }, [resolved]);

  // cleanup
  useEffect(() => {
    return () => {
      instancesRef.current.forEach((inst) => {
        (inst as any)._unsubscribe?.();
        (inst as any)._observer?.disconnect();
        inst.terminal.dispose();
      });
      instancesRef.current.clear();
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
        <TabItem
          id={1000}
          name="DEV"
          isActive={activeTab === 1000}
          onClick={setActiveTab}
          icon={<Zap className="size-3.5 text-[#E5C07B]" />}
        />

        {tabs.map((tabId) => {
          const isActive = tabId === activeTab;
          return (
            <TabItem
              key={tabId}
              id={tabId}
              name={`Terminal ${tabId}`}
              isActive={isActive}
              onClick={setActiveTab}
              icon={<TerminalSquare className="size-3.5" />}
              onClose={removeTerminal}
            />
          );
        })}

        {/* Add terminal button */}
        {tabs.length < MAX_TERMINALS && (
          <button
            className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
            onClick={addTerminal}
            title="New Terminal"
          >
            <Plus className="size-3.5" />
          </button>
        )}

        {/* Collapse button — pushed to the right */}
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
      {collapsed ? (
        <div className="relative flex-1 overflow-hidden bg-card">
          {tabs.map((tabId) => (
            <div
              key={tabId}
              ref={(el) => {
                if (el) initTerminal(tabId, el);
              }}
              className={cn("absolute inset-0", tabId === activeTab ? "block" : "hidden")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TabItem({
  id,
  name,
  isActive,
  onClick,
  onClose,
  icon,
}: {
  id: number;
  name: string;
  isActive: boolean;
  onClick: (id: number) => void;
  onClose?: (id: number) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div
      key={id}
      className={cn(
        "group flex items-center gap-1.5 rounded-full px-3 py-1 text-xs cursor-pointer transition-colors",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
      onClick={() => onClick(id)}
    >
      {icon ?? <TerminalSquare className="size-3.5" />}
      <span>{name}</span>
      {onClose && (
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

/** 小型 toggle 按钮，用于收起后在右下角展示 */
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
