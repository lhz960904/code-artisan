import { useRef } from "react";
import { Globe, ExternalLink, RefreshCw, MonitorX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useIframeBridge } from "@/hooks/use-iframe-bridge";
import { useWorkspaceStore } from "@/stores/workspace";
import { BrowserErrorBadge } from "./browser-error-badge";

export function PreviewPanel() {
  const files = useWorkspaceStore((s) => s.files);
  const snapshotsLoaded = useWorkspaceStore((s) => s.snapshotsLoaded);
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useIframeBridge(iframeRef);

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
      <iframe
        ref={iframeRef}
        src={previewUrl}
        className="flex-1 bg-white h-full"
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-modals allow-downloads"
        title="Preview"
      />
    </div>
  );
}
