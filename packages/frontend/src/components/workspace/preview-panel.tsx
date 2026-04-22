import { Globe, ExternalLink, RefreshCw, Play, MonitorX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/stores/workspace";

function isWebProject(files: Map<string, string>): boolean {
  const pkgJson = files.get("package.json");
  if (!pkgJson) return false;
  try {
    const pkg = JSON.parse(pkgJson) as { scripts?: Record<string, string> };
    return !!(pkg.scripts?.dev || pkg.scripts?.start);
  } catch {
    return false;
  }
}

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

  if (!isWebProject(files)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <MonitorX className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">不支持预览</p>
        <p className="max-w-[240px] text-center text-xs opacity-60">
          此项目未检测到 Web 入口，预览仅支持包含 <code className="rounded bg-muted px-1 py-0.5 text-[11px]">package.json</code> 的前端项目。
        </p>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <Globe className="h-10 w-10 opacity-30" />
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-foreground">开发服务器未运行</p>
          <p className="max-w-[240px] text-center text-xs opacity-60">
            启动后可在此处实时预览项目效果
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setPendingChatMessage("请启动这个项目的开发服务器")}
        >
          <Play className="h-3.5 w-3.5" />
          启动开发服务器
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
        className="flex-1 bg-white"
        sandbox="allow-scripts allow-forms allow-popups"
        title="Preview"
      />
    </div>
  );
}
