import { Link } from "@tanstack/react-router";
import { ExternalLink, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/common/logo";
import {
  type ConversationResponse,
  type QuotaResponse,
  useConversationUpdate,
} from "@/api";
import { useWorkspaceStore } from "@/stores/workspace";

interface HeaderProps {
  conversationId: string;
  conversation: ConversationResponse;
  quota: QuotaResponse;
}

export function Header({ conversationId, conversation, quota }: HeaderProps) {
  const updateConv = useConversationUpdate();
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);

  function toggleMode() {
    const newMode = conversation.mode === "yolo" ? "confirm" : "yolo";
    updateConv.mutate({ id: conversationId, mode: newMode });
  }

  const usedPercent = Math.round((quota.usedTokens / quota.totalTokens) * 100);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-1.5 hover:opacity-80">
          <Logo className="size-5" />
          <span className="text-sm font-bold tracking-tight">CodeArtisan</span>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
          {conversation.title || "Untitled"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">{usedPercent}%</span>
        <Badge
          variant="outline"
          className="cursor-pointer select-none gap-1 text-[10px] uppercase"
          onClick={toggleMode}
        >
          {conversation.mode === "confirm" ? (
            <><Shield className="h-3 w-3" /> Confirm</>
          ) : (
            <><Zap className="h-3 w-3" /> Yolo</>
          )}
        </Badge>
        {previewUrl && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              Preview <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>
    </header>
  );
}
