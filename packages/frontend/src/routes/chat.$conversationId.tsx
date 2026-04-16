import { useEffect } from "react";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useWorkspaceStore } from "@/stores/workspace";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();
  const initialMessage = useRouterState({
    select: (s) => (s.location.state as { initialMessage?: string })?.initialMessage,
  });

  // Fresh workspace per conversation.
  const reset = useWorkspaceStore((s) => s.reset);
  useEffect(() => {
    reset();
  }, [conversationId, reset]);

  return <WorkspaceLayout conversationId={conversationId} initialMessage={initialMessage} />;
}
