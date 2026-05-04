import { useState } from "react";
import { ChevronDown, CircleEllipsis, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolCallItem } from "@/components/chat/tool-call-item";
import type { ToolGroupChunk } from "@/components/chat/message-chunks";

interface ToolGroupCardProps {
  group: ToolGroupChunk;
  isLive?: boolean;
}

export function ToolGroupCard({ group, isLive }: ToolGroupCardProps) {
  const total = group.tools.length;
  const running = group.tools.some((t) => !t.toolResult);
  const hasError = group.tools.some(
    (t) => t.toolResult && t.toolResult.content.trim().startsWith("Error"),
  );
  const [expanded, setExpanded] = useState(running);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 -ml-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        {running && isLive ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <CircleEllipsis
            className={cn("h-3.5 w-3.5 shrink-0", hasError && "text-destructive")}
          />
        )}
        <span>
          {running && isLive ? `${total} actions running…` : `${total} actions taken`}
        </span>
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5 pl-3">
          {group.tools.map((t) => (
            <ToolCallItem key={t.toolUse.id} toolUse={t.toolUse} toolResult={t.toolResult} />
          ))}
        </div>
      )}
    </div>
  );
}
