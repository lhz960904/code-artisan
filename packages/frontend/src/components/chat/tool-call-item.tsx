import { useState } from "react";
import {
  FileText,
  FileCode,
  Terminal,
  FolderOpen,
  Play,
  Replace,
  Globe,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolUseContent, ToolResultContent } from "@code-artisan/shared";
import { useWorkspaceStore } from "@/stores/workspace";

export const TOOL_CONFIG: Record<string, { icon: typeof FileText; label: (input: Record<string, string>) => string }> = {
  write_file: { icon: FileCode, label: (i) => `write ${i.path ?? "..."}` },
  read_file: { icon: FileText, label: (i) => `read ${i.path ?? "..."}` },
  bash: { icon: Terminal, label: (i) => i.command ?? "..." },
  ls: { icon: FolderOpen, label: (i) => `ls ${i.path ?? "..."}` },
  start_server: { icon: Play, label: (i) => `server :${i.port ?? "..."}` },
  str_replace: { icon: Replace, label: (i) => `edit ${i.path ?? "..."}` },
  web_search: { icon: Globe, label: (i) => `search "${i.query ?? "..."}"` },
  web_fetch: { icon: Globe, label: (i) => `fetch ${i.url ?? "..."}` },
};

const FILE_PATH_TOOLS = new Set(["write_file", "read_file", "str_replace"]);

function getFilePath(toolUse: ToolUseContent): string | null {
  if (!FILE_PATH_TOOLS.has(toolUse.name)) return null;
  const input = toolUse.input as { path?: unknown };
  return typeof input.path === "string" && input.path ? input.path : null;
}

interface ToolCallItemProps {
  toolUse: ToolUseContent;
  toolResult?: ToolResultContent;
}

export function ToolCallItem({ toolUse, toolResult }: ToolCallItemProps) {
  const [expanded, setExpanded] = useState(false);
  const openFile = useWorkspaceStore((s) => s.openFile);

  const config = TOOL_CONFIG[toolUse.name];
  const Icon = config?.icon ?? Terminal;
  const label = config?.label(toolUse.input as Record<string, string>) ?? toolUse.name;
  const filePath = getFilePath(toolUse);
  const canOpen = useWorkspaceStore((s) => (filePath ? s.files.has(filePath) : false));

  const isDone = !!toolResult;
  const hasError = !!toolResult && toolResult.content.trim().startsWith("Error");
  const output = toolResult?.content ?? "";

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card text-xs">
      <div className="flex items-center transition-colors hover:bg-accent/50">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-foreground">{label}</span>
        </button>
        <div className="flex items-center gap-1 pr-2">
          {filePath && canOpen && (
            <button
              type="button"
              onClick={() => openFile(filePath)}
              title="Open in editor"
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
          {isDone ? (
            <div className={cn("h-1.5 w-1.5 rounded-full", hasError ? "bg-destructive" : "bg-success")} />
          ) : (
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
          )}
          <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        </div>
      </div>
      {expanded && output && (
        <div className="max-h-40 overflow-y-auto border-t border-border px-3 py-2">
          <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-muted-foreground">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
