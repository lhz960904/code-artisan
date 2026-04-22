import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTheme } from "@/contexts/theme-context";
import { terminalBus } from "@/lib/terminal-bus";

function getTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue("--background").trim();
  const fg = style.getPropertyValue("--foreground").trim();
  const selection = style.getPropertyValue("--accent").trim();

  return {
    background: bg ? `hsl(${bg})` : "#1e1e1e",
    foreground: fg ? `hsl(${fg})` : "#d4d4d4",
    cursor: fg ? `hsl(${fg})` : "#d4d4d4",
    selectionBackground: selection ? `hsl(${selection})` : "#264f78",
  };
}

export function TerminalPanel() {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      theme: getTerminalTheme(),
      fontSize: 12,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(termRef.current);

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

    return () => {
      unsubscribe();
      observer.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    const id = requestAnimationFrame(() => {
      term.options.theme = getTerminalTheme();
      term.refresh(0, term.rows - 1);
    });
    return () => cancelAnimationFrame(id);
  }, [resolved]);

  return <div ref={termRef} className="h-full w-full bg-background" />;
}
