import { createRoute } from "@tanstack/react-router";
import {
  conversationDetailOptions,
  conversationMessagesOptions,
  fileSnapshotsOptions,
  quotaOptions,
} from "@/api/queries";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { authedRoute } from "@/pages/layout/authed";
import { useWorkspaceStore } from "@/stores/workspace";
import { terminalBus } from "@/lib/terminal-bus";

export const chatRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/chat/$conversationId",
  loader: ({ context: { queryClient }, params }) => {
    useWorkspaceStore.getState().reset();
    terminalBus.emit({ type: "clear" });
    queryClient.ensureQueryData(conversationDetailOptions(params.conversationId));
    queryClient.ensureQueryData(conversationMessagesOptions(params.conversationId));
    queryClient.ensureQueryData(fileSnapshotsOptions(params.conversationId));
    queryClient.ensureQueryData(quotaOptions());
  },
  component: ChatPage,
});

export function ChatPage() {
  const { conversationId } = chatRoute.useParams();
  return <WorkspaceLayout conversationId={conversationId} />;
}
