import type { ToolCallPart } from "@code-artisan/shared";
import { ConfirmCard } from "./confirm-card";

interface ToolCallCardProps {
  part: ToolCallPart;
  conversationId: string;
}

const TOOL_ICONS: Record<string, { icon: string; color: string }> = {
  write_file: { icon: "W", color: "text-[#58a6ff] bg-[#58a6ff]/15" },
  read_file: { icon: "R", color: "text-[#d29922] bg-[#d29922]/15" },
  bash: { icon: "$", color: "text-[#3fb950] bg-[#3fb950]/15" },
  ls: { icon: "L", color: "text-[#bc8cff] bg-[#bc8cff]/15" },
  start_server: { icon: "▶", color: "text-[#f778ba] bg-[#f778ba]/15" },
  str_replace: { icon: "S", color: "text-[#f0883e] bg-[#f0883e]/15" },
};

export function ToolCallCard({ part, conversationId }: ToolCallCardProps) {
  const toolInfo = TOOL_ICONS[part.toolName] ?? {
    icon: "?",
    color: "text-[#8b949e] bg-[#8b949e]/15",
  };

  const isDone = part.state === "result" || part.state === "error";
  const hasError = part.state === "error";
  const isPending = part.approval === "pending";

  const args = part.input as Record<string, string>;
  let label = part.toolName;
  if (part.toolName === "write_file") label = `write ${args.path}`;
  else if (part.toolName === "read_file") label = `read ${args.path}`;
  else if (part.toolName === "bash") label = args.command;
  else if (part.toolName === "ls") label = `ls ${args.path}`;
  else if (part.toolName === "start_server") label = `server :${args.port}`;
  else if (part.toolName === "str_replace") label = `edit ${args.path}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#1c2128] px-3 py-2 font-mono text-xs">
        <div
          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${toolInfo.color}`}
        >
          {toolInfo.icon}
        </div>
        <span className="truncate text-[#e6edf3]">{label}</span>
        <div className="ml-auto">
          {isDone ? (
            <div
              className={`h-1.5 w-1.5 rounded-full ${hasError ? "bg-[#f85149]" : "bg-[#3fb950]"}`}
            />
          ) : (
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d29922]" />
          )}
        </div>
      </div>
      {isPending && (
        <ConfirmCard
          part={part}
          conversationId={conversationId}
        />
      )}
    </div>
  );
}
