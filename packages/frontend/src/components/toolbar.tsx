import { useEffect, useState } from "react";
import { getConversation, updateConversation, getQuota, type ConversationResponse, type QuotaResponse } from "../lib/api";
import { useWorkspace } from "../contexts/workspace-context";

interface ToolbarProps {
  conversationId: string;
}

export function Toolbar({ conversationId }: ToolbarProps) {
  const [conv, setConv] = useState<ConversationResponse | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const { previewUrl } = useWorkspace();

  useEffect(() => {
    getConversation(conversationId).then(setConv).catch(console.error);
    getQuota().then(setQuota).catch(console.error);
  }, [conversationId]);

  async function toggleMode() {
    if (!conv) return;
    const newMode = conv.mode === "yolo" ? "confirm" : "yolo";
    const updated = await updateConversation(conversationId, { mode: newMode });
    setConv(updated);
  }

  const usedPercent = quota ? Math.round((quota.usedTokens / quota.totalTokens) * 100) : 0;

  return (
    <div className="flex h-10 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[#e6edf3]">
          {conv?.title || "Untitled"}
        </span>
        <button
          onClick={toggleMode}
          className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-medium ${
            conv?.mode === "confirm"
              ? "bg-[#d29922]/20 text-[#d29922]"
              : "bg-[#238636]/20 text-[#3fb950]"
          }`}
        >
          {conv?.mode || "yolo"}
        </button>
      </div>
      <div className="flex items-center gap-3">
        {quota && (
          <span className="text-[10px] text-[#484f58]">
            {usedPercent}% quota used
          </span>
        )}
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
