import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { WorkspaceProvider } from "@/contexts/workspace-context";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();
  const initialMessage = useRouterState({
    select: (s) => (s.location.state as { initialMessage?: string })?.initialMessage,
  });

  return (
    <WorkspaceProvider>
      <WorkspaceLayout conversationId={conversationId} initialMessage={initialMessage} />
    </WorkspaceProvider>
  );
}
