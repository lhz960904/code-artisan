import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "../components/chat-panel";

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();

  return (
    <div className="flex h-full flex-col">
      <ChatPanel conversationId={conversationId} />
    </div>
  );
}
