import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "../components/chat-panel";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-2">
        <Link to="/" className="text-sm text-[#8b949e] hover:text-[#58a6ff]">
          ← Back
        </Link>
        <span className="font-mono text-xs text-[#484f58]">
          {conversationId.slice(0, 8)}
        </span>
      </div>
      <ChatPanel conversationId={conversationId} />
    </div>
  );
}
