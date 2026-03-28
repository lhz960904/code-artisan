import type { StreamEvent } from "../lib/event-source";

interface ToolCallCardProps {
  event: StreamEvent;
  result?: StreamEvent;
}

const TOOL_ICONS: Record<string, { icon: string; color: string }> = {
  write_file: { icon: "W", color: "text-[#58a6ff] bg-[#58a6ff]/15" },
  read_file: { icon: "R", color: "text-[#d29922] bg-[#d29922]/15" },
  execute_command: { icon: "$", color: "text-[#3fb950] bg-[#3fb950]/15" },
  list_files: { icon: "L", color: "text-[#bc8cff] bg-[#bc8cff]/15" },
  start_server: { icon: "▶", color: "text-[#f778ba] bg-[#f778ba]/15" },
};

export function ToolCallCard({ event, result }: ToolCallCardProps) {
  const data = event.data as { tool: string; args: Record<string, string> };
  const toolInfo = TOOL_ICONS[data.tool] ?? {
    icon: "?",
    color: "text-[#8b949e] bg-[#8b949e]/15",
  };
  const isDone = !!result;
  const hasError = result && (result.data as { error?: string }).error;

  let label = data.tool;
  if (data.tool === "write_file") label = `write ${data.args.path}`;
  else if (data.tool === "read_file") label = `read ${data.args.path}`;
  else if (data.tool === "execute_command") label = data.args.command;
  else if (data.tool === "list_files") label = `ls ${data.args.path}`;
  else if (data.tool === "start_server") label = `server :${data.args.port}`;

  return (
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
  );
}
