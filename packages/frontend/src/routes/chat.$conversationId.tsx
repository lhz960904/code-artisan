import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceProvider } from "@/contexts/workspace-context";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();

  return (
    <WorkspaceProvider>
      <WorkspaceLayout conversationId={conversationId} />
    </WorkspaceProvider>
  );
}
