import { createRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { conversationsListOptions } from "@/api";
import { authedRoute } from "./layout/authed";
import { AppSidebar, AppSidebarSkeleton } from "@/components/layout/app-sidebar";
import { Sender } from "@/components/chat/sender";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useStartConversation } from "@/hooks/use-start-conversation";
import { usePendingPromptStore } from "@/stores/pending-prompt";

export const dashboardRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/dashboard",
  loader: ({ context: { queryClient } }) => {
    queryClient.ensureQueryData(conversationsListOptions());
  },
  component: DashboardPage,
});

export function DashboardPage() {
  const fileUpload = useFileUpload();
  const { start, busy } = useStartConversation();
  const [prompt, setPrompt] = useState("");
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const draft = usePendingPromptStore.getState().consumeDraft();
    if (!draft) return;
    if (draft.prompt) setPrompt(draft.prompt);
    if (draft.attachments.length > 0) fileUpload.seedUploaded(draft.attachments);
  }, [fileUpload]);

  const handleSubmit = (content: string) =>
    start(content, fileUpload.attachments);

  return (
    <div className="h-screen bg-background text-foreground">
      <ResizablePanelGroup
        orientation="horizontal"
        id="dashboard-main"
        panelIds={["sidebar", "main"]}
      >
        <ResizablePanel id="sidebar" defaultSize="18%" minSize="12%" maxSize="32%">
          <Suspense fallback={<AppSidebarSkeleton />}>
            <AppSidebar />
          </Suspense>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="main" defaultSize="82%" minSize="60%">
          <div className="flex h-full min-w-0 flex-col items-center justify-center px-4">
            <h1 className="mb-8 font-display text-3xl font-semibold text-foreground">
              What do you want to build?
            </h1>
            <div className="w-full max-w-2xl">
              <Sender
                size="large"
                submitLabel="Start"
                placeholder="Describe your project…"
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleSubmit}
                busy={busy}
                files={fileUpload.files}
                onAddFiles={fileUpload.addFiles}
                onRemoveFile={fileUpload.removeFile}
                isUploading={fileUpload.isUploading}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
