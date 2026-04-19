import { createRoute } from "@tanstack/react-router";
import { useEffect } from "react";
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
    queryClient.ensureQueryData(conversationDetailOptions(params.conversationId));
    queryClient.ensureQueryData(conversationMessagesOptions(params.conversationId));
    queryClient.ensureQueryData(fileSnapshotsOptions(params.conversationId));
    queryClient.ensureQueryData(quotaOptions());
  },
  component: ChatPage,
});

export function ChatPage() {
  const { conversationId } = chatRoute.useParams();
  const reset = useWorkspaceStore((s) => s.reset);

  useEffect(() => {
    reset();
  }, [conversationId, reset]);

  return <WorkspaceLayout conversationId={conversationId} />;
}
