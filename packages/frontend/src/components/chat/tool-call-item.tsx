import { useState } from "react";
import { FileText, FileCode, Terminal, FolderOpen, Play, Replace, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCallPart } from "@code-artisan/shared";

const TOOL_CONFIG: Record<string, { icon: typeof FileText; label: (input: Record<string, string>) => string }> = {
  write_file: { icon: FileCode, label: (i) => `write ${i.path}` },
  read_file:  { icon: FileText, label: (i) => `read ${i.path}` },
  bash:       { icon: Terminal, label: (i) => i.command },
  ls:         { icon: FolderOpen, label: (i) => `ls ${i.path}` },
  start_server: { icon: Play, label: (i) => `server :${i.port}` },
  str_replace:  { icon: Replace, label: (i) => `edit ${i.path}` },
};

interface ToolCallItemProps {
  part: ToolCallPart;
}

export function ToolCallItem({ part }: ToolCallItemProps) {
  const [expanded, setExpanded] = useState(false);
  const config = TOOL_CONFIG[part.toolName];
  const Icon = config?.icon ?? Terminal;
  const label = config?.label(part.input as Record<string, string>) ?? part.toolName;

  const isDone = part.state === "result" || part.state === "error";
  const hasError = part.state === "error";

  return (
    <div className="rounded-lg border border-border bg-card text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-foreground">{label}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {isDone ? (
            <div className={cn("h-1.5 w-1.5 rounded-full", hasError ? "bg-destructive" : "bg-success")} />
          ) : (
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
          )}
          <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        </div>
      </button>
      {expanded && part.output && (
        <div className="border-t border-border px-3 py-2 max-h-40 overflow-y-auto">
          <pre className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
            {part.output}
          </pre>
        </div>
      )}
    </div>
  );
}
