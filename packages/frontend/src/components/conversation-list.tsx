import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listConversations, createConversation, type ConversationResponse } from "../lib/api";

export function ConversationList() {
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleNew() {
    const conv = await createConversation();
    setConversations((prev) => [conv, ...prev]);
  }

  if (loading) {
    return <div className="text-sm text-[#8b949e]">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleNew}
        className="w-full rounded-md border border-dashed border-[#30363d] py-3 text-sm text-[#8b949e] hover:border-[#58a6ff] hover:text-[#58a6ff]"
      >
        + New Conversation
      </button>
      {conversations.map((conv) => (
        <Link
          key={conv.id}
          to="/chat/$conversationId"
          params={{ conversationId: conv.id }}
          className="block rounded-md border border-[#30363d] bg-[#161b22] p-3 hover:border-[#58a6ff]"
        >
          <div className="text-sm font-medium text-[#e6edf3]">
            {conv.title || "Untitled"}
          </div>
          <div className="mt-1 text-xs text-[#8b949e]">
            {new Date(conv.updated_at).toLocaleString()}
          </div>
        </Link>
      ))}
      {conversations.length === 0 && (
        <div className="text-center text-sm text-[#484f58]">
          No conversations yet. Start one!
        </div>
      )}
    </div>
  );
}
