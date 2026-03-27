import { useEffect, useState } from "react";
import { getConversation, type ConversationResponse } from "../lib/api";
import { useWorkspace } from "../contexts/workspace-context";

interface ToolbarProps {
  conversationId: string;
}

export function Toolbar({ conversationId }: ToolbarProps) {
  const [conv, setConv] = useState<ConversationResponse | null>(null);
  const { previewUrl } = useWorkspace();

  useEffect(() => {
    getConversation(conversationId).then(setConv).catch(console.error);
  }, [conversationId]);

  return (
    <div className="flex h-10 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[#e6edf3]">
          {conv?.title || "Untitled"}
        </span>
        <span className="rounded bg-[#21262d] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#8b949e]">
          {conv?.mode || "yolo"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1 text-xs text-[#58a6ff] hover:border-[#58a6ff]"
          >
            Preview ↗
          </a>
        )}
      </div>
    </div>
  );
}
