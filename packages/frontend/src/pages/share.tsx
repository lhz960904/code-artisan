import { Suspense, useEffect, useRef, useState } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Code2, ExternalLink, Eye, Loader2 } from "lucide-react";
import type { StoredMessage } from "@code-artisan/shared";
import { apiFetch } from "@/api/client";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { StaticMessageView } from "@/components/chat/message-list";
import { FilesPanel } from "@/components/workspace/file-tree";
import { EditorPanel } from "@/components/workspace/editor-panel";
import { useWorkspaceStore } from "@/stores/workspace";
import { cn } from "@/lib/utils";
import { rootRoute } from "@/pages/layout/root";

interface SharedConversation {
  id: string;
  title: string | null;
  deployUrl: string;
  sharedAt: string;
  createdAt: string;
}

interface SharedFile {
  path: string;
  content: string;
  updatedAt: string;
}

export interface SharePayload {
  conversation: SharedConversation;
  messages: StoredMessage[];
  files: SharedFile[];
}

export const shareKeys = {
  detail: (slug: string) => ["share", slug] as const,
};

export const shareOptions = (slug: string) =>
  queryOptions({
    queryKey: shareKeys.detail(slug),
    queryFn: () => apiFetch<SharePayload>(`/public/conversations/${slug}`),
    staleTime: 60_000,
    retry: false,
  });

type ShareView = "preview" | "code";

function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <Link to="/" className="flex items-center gap-1.5 hover:opacity-80">
          <Logo className="size-5" />
          <span className="text-sm font-bold tracking-tight">CodeArtisan</span>
        </Link>
        <span className="text-xs text-muted-foreground">Shared workspace · read-only</span>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function ShareSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <Skeleton className="h-32 w-96" />
    </div>
  );
}

function ShareWorkspace() {
  const { slug } = shareRoute.useParams();
  const { data } = useSuspenseQuery(shareOptions(slug));
  const setSnapshots = useWorkspaceStore((s) => s.setSnapshots);
  const reset = useWorkspaceStore((s) => s.reset);
  const [view, setView] = useState<ShareView>("preview");

  useEffect(() => {
    reset();
    setSnapshots(data.files);
    return () => reset();
  }, [data, reset, setSnapshots]);

  return (
    <ResizablePanelGroup orientation="horizontal" id="share-layout" panelIds={["chat", "right"]}>
      <ResizablePanel id="chat" defaultSize="28%" minSize="20%" maxSize="50%">
        <ChatColumn title={data.conversation.title} messages={data.messages} />
      </ResizablePanel>
      <ResizableHandle className="w-px bg-border" />
      <ResizablePanel id="right" defaultSize="72%">
        <RightColumn deployUrl={data.conversation.deployUrl} view={view} onChangeView={setView} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function ChatColumn({ title, messages }: { title: string | null; messages: StoredMessage[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="truncate text-sm font-semibold">{title || "Untitled"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{messages.length} messages</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <StaticMessageView messages={messages} />
      </div>
    </div>
  );
}

function RightColumn({
  deployUrl,
  view,
  onChangeView,
}: {
  deployUrl: string;
  view: ShareView;
  onChangeView: (v: ShareView) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
        <Button
          variant={view === "preview" ? "secondary" : "ghost"}
          size="xs"
          onClick={() => onChangeView("preview")}
        >
          <Eye />
          <span>Preview</span>
        </Button>
        <Button
          variant={view === "code" ? "secondary" : "ghost"}
          size="xs"
          onClick={() => onChangeView("code")}
        >
          <Code2 />
          <span>Code</span>
        </Button>
        <Button variant="ghost" size="xs" className="ml-auto" asChild>
          <a href={deployUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
            <span>Open app</span>
          </a>
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", view === "preview" ? "block" : "hidden")}>
          <PreviewFrame deployUrl={deployUrl} />
        </div>
        <div className={cn("absolute inset-0", view === "code" ? "block" : "hidden")}>
          <ResizablePanelGroup orientation="horizontal" id="share-code" panelIds={["files", "editor"]}>
            <ResizablePanel id="files" defaultSize="22%" minSize="10%" maxSize="40%">
              <div className="h-full bg-card">
                <FilesPanel />
              </div>
            </ResizablePanel>
            <ResizableHandle className="w-px bg-border" />
            <ResizablePanel id="editor" defaultSize="78%">
              <EditorPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}

// Browsers don't expose load failure for cross-origin iframes (X-Frame-Options /
// frame-ancestors blocks happen silently). Best-effort: if `onLoad` hasn't fired
// within STUCK_TIMEOUT_MS, surface a banner with an "Open in new tab" escape.
const STUCK_TIMEOUT_MS = 8000;

function PreviewFrame({ deployUrl }: { deployUrl: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "stuck">("loading");
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStatus("loading");
    stuckTimerRef.current = setTimeout(() => {
      setStatus((s) => (s === "loading" ? "stuck" : s));
    }, STUCK_TIMEOUT_MS);
    return () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    };
  }, [deployUrl]);

  const onLoaded = () => {
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    setStatus("loaded");
  };

  return (
    <div className="relative h-full w-full">
      <iframe
        src={deployUrl}
        title="Shared app"
        className="h-full w-full border-0"
        onLoad={onLoaded}
      />
      {status !== "loaded" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-3 pt-3">
          <div
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-sm",
              status === "stuck"
                ? "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {status === "stuck" ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">App didn't load — it may block embedding.</span>
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-medium underline-offset-2 hover:underline"
                >
                  Open in new tab
                </a>
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <span>Loading shared app…</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$slug",
  loader: ({ context, params }) => context.queryClient.ensureQueryData(shareOptions(params.slug)),
  component: () => (
    <ShareLayout>
      <Suspense fallback={<ShareSkeleton />}>
        <ShareWorkspace />
      </Suspense>
    </ShareLayout>
  ),
});
