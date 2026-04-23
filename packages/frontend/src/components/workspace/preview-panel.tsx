import { Globe, ExternalLink, RefreshCw, Play, MonitorX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/stores/workspace";

export function PreviewPanel() {
  const files = useWorkspaceStore((s) => s.files);
  const snapshotsLoaded = useWorkspaceStore((s) => s.snapshotsLoaded);
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);
  const setPendingChatMessage = useWorkspaceStore((s) => s.setPendingChatMessage);

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
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <Globe className="h-10 w-10 opacity-30" />
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-foreground">Development server is not running</p>
          <p className="max-w-[240px] text-center text-xs opacity-60">
            Start it to preview your project here in real time
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setPendingChatMessage("Please start this project's development server")}
        >
          <Play className="h-3.5 w-3.5" />
          Start development server
        </Button>
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
        className="flex-1 bg-white h-full"
        sandbox="allow-scripts allow-forms allow-popups"
        title="Preview"
      />
    </div>
  );
}
