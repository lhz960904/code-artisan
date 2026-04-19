import { createRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { conversationsListOptions } from "@/api";
import { authedRoute } from "./layout/authed";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Sender } from "@/components/chat/sender";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useStartConversation } from "@/hooks/use-start-conversation";
import { usePendingPromptStore } from "@/stores/pending-prompt";
import { useSuspenseQuery } from "@tanstack/react-query";

export const dashboardRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/dashboard",
  component: DashboardPage,
});

export function DashboardPage() {
  const fileUpload = useFileUpload();
  const { start, busy } = useStartConversation();
  const [prompt, setPrompt] = useState("");
  const hydratedRef = useRef(false);

  // Hydrate the sender with any draft carried over from the Home page (e.g.
  // after the Home → login → dashboard roundtrip). The user still has to hit
  // Start explicitly to create the conversation.
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

  const { data: conversations = [] } = useSuspenseQuery(conversationsListOptions());

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar conversations={conversations} />
      <div className="min-w-0 flex-1">
        <div className="flex h-screen flex-col items-center justify-center px-4">
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
      </div>
    </div>
  );
}
