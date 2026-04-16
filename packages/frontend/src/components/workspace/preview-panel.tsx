import { Globe, ExternalLink, RefreshCw } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace";

export function PreviewPanel() {
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);

  if (!previewUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Globe className="h-10 w-10 opacity-30" />
        <p className="text-sm">No preview available</p>
        <p className="max-w-[240px] text-center text-xs opacity-60">
          Start a server with <code className="rounded bg-muted px-1 py-0.5 text-[11px]">start_server</code> to see a live preview here.
        </p>
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
          <button
            onClick={() => {
              const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]');
              if (iframe) iframe.src = previewUrl;
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
        src={previewUrl}
        className="flex-1 bg-white"
        sandbox="allow-scripts allow-forms allow-popups"
        title="Preview"
      />
    </div>
  );
}
