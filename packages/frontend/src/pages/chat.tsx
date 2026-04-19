import { createRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
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
  loader: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(conversationDetailOptions(params.conversationId)),
      queryClient.ensureQueryData(conversationMessagesOptions(params.conversationId)),
      queryClient.ensureQueryData(fileSnapshotsOptions(params.conversationId)),
      queryClient.ensureQueryData(quotaOptions()),
    ]);
  },
  pendingComponent: () => <div className="p-6 text-sm text-muted-foreground">Loading workspace...</div>,
  component: ChatPage,
});

export function ChatPage() {
  const { conversationId } = chatRoute.useParams();

  const { data: conversation } = useSuspenseQuery(conversationDetailOptions(conversationId));
  const { data: quota } = useSuspenseQuery(quotaOptions());
  const { data: messages } = useSuspenseQuery(conversationMessagesOptions(conversationId));
  const { data: snapshots } = useSuspenseQuery(fileSnapshotsOptions(conversationId));

  const reset = useWorkspaceStore((s) => s.reset);
  const setSnapshots = useWorkspaceStore((s) => s.setSnapshots);

  useEffect(() => {
    reset();
    setSnapshots(snapshots);
  }, [conversationId, snapshots, reset, setSnapshots]);

  return (
    <WorkspaceLayout
      conversationId={conversationId}
      conversation={conversation}
      quota={quota}
      initialMessages={messages}
    />
  );
}
