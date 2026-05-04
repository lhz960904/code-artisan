import { useEffect, useRef, useState } from "react";
import { Globe, ExternalLink, Loader2, RefreshCw, MonitorX } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useIframeBridge } from "@/hooks/use-iframe-bridge";
import { useWorkspaceStore } from "@/stores/workspace";
import { previewVersionMutationKey } from "@/api/mutations";
import { BrowserErrorBadge } from "./browser-error-badge";

const HMR_GRACE_MS = 800;

interface PreviewPanelProps {
  conversationId: string;
}

export function PreviewPanel({ conversationId }: PreviewPanelProps) {
  const files = useWorkspaceStore((s) => s.files);
  const snapshotsLoaded = useWorkspaceStore((s) => s.snapshotsLoaded);
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useIframeBridge(iframeRef);

  // Active while a preview-version mutation is in flight; held for an extra
  // HMR_GRACE_MS after it resolves so Vite has time to detect mtime changes
  // and propagate before we reveal the (possibly still-stale) iframe.
  const isSyncing = useIsMutating({ mutationKey: previewVersionMutationKey(conversationId) }) > 0;
  const [showOverlay, setShowOverlay] = useState(false);
  useEffect(() => {
    if (isSyncing) {
      setShowOverlay(true);
      return;
    }
    const t = setTimeout(() => setShowOverlay(false), HMR_GRACE_MS);
    return () => clearTimeout(t);
  }, [isSyncing]);

  if (!snapshotsLoaded) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  if (files.size === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <MonitorX className="h-10 w-10 opacity-30" />
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-foreground">No files in the project</p>
        </div>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Globe className="h-10 w-10 opacity-30" />
        <p className="animate-shimmer-text text-sm font-medium">Your preview will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 items-center justify-between border-b border-border bg-card px-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" />
          <span className="truncate max-w-xs">{previewUrl}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <BrowserErrorBadge />
          <button
            onClick={() => {
              if (iframeRef.current) iframeRef.current.src = previewUrl;
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Open in new tab"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="relative flex-1">
        <iframe
          ref={iframeRef}
          src={previewUrl}
          className="absolute inset-0 h-full w-full bg-white"
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-modals allow-downloads"
          title="Preview"
        />
        {showOverlay && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Syncing version…</span>
          </div>
        )}
      </div>
    </div>
  );
}
