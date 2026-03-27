import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useWorkspace } from "../contexts/workspace-context";

export function TerminalPanel() {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenCountRef = useRef(0);
  const { terminalHistory } = useWorkspace();

  // Initialize terminal
  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#e6edf3",
        selectionBackground: "#264f78",
      },
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

    return () => {
      observer.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
      writtenCountRef.current = 0;
    };
  }, []);

  // Write new terminal entries
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    const newEntries = terminalHistory.slice(writtenCountRef.current);
    for (const entry of newEntries) {
      term.writeln(`\x1b[32m$ ${entry.command}\x1b[0m`);
      if (entry.output) {
        for (const line of entry.output.split("\n")) {
          term.writeln(line);
        }
      }
      if (entry.error) {
        for (const line of entry.error.split("\n")) {
          term.writeln(`\x1b[31m${line}\x1b[0m`);
        }
      }
      term.writeln("");
    }
    writtenCountRef.current = terminalHistory.length;
  }, [terminalHistory]);

  return <div ref={termRef} className="h-full w-full" />;
}
