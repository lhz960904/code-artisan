import { useEffect } from "react";
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  conversationDetailOptions,
  conversationMessagesOptions,
  fileSnapshotsOptions,
  quotaOptions,
} from "@/api/queries";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { authedRoute } from "@/pages/layout/authed";
import { useWorkspaceStore } from "@/stores/workspace";

export const chatRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/chat/$conversationId",
  loader: ({ context: { queryClient }, params }) => {
    useWorkspaceStore.getState().reset();
    queryClient.ensureQueryData(conversationDetailOptions(params.conversationId));
    queryClient.ensureQueryData(conversationMessagesOptions(params.conversationId));
    queryClient.ensureQueryData(fileSnapshotsOptions(params.conversationId));
    queryClient.ensureQueryData(quotaOptions());
  },
  component: ChatPage,
});

export function ChatPage() {
  const { conversationId } = chatRoute.useParams();
  const { data: conversation } = useQuery(conversationDetailOptions(conversationId));

  // Seed the preview URL from server state — the manager keys it by sandboxId,
  // so this rehydrates a still-alive preview after a page reload.
  const previewUrl = conversation?.previewUrl ?? null;
  useEffect(() => {
    useWorkspaceStore.getState().setPreviewUrl(previewUrl);
  }, [previewUrl, conversationId]);

  return <WorkspaceLayout conversationId={conversationId} />;
}
