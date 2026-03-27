import { createRootRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { listConversations, createConversation, deleteConversation, type ConversationResponse } from "../lib/api";

export const Route = createRootRoute({
  component: RootLayout,
});

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

function RootLayout() {
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  const refreshConversations = useCallback(() => {
    listConversations().then(setConversations).catch(console.error);
  }, []);

  // Initial load
  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Refresh sidebar when navigating (picks up title changes)
  useEffect(() => {
    refreshConversations();
  }, [location.pathname, refreshConversations]);

  async function handleNewChat() {
    const conv = await createConversation();
    setConversations((prev) => [conv, ...prev]);
    navigate({ to: "/chat/$conversationId", params: { conversationId: conv.id } });
  }

  async function handleDelete(e: React.MouseEvent, convId: string) {
    e.preventDefault();
    e.stopPropagation();
    await deleteConversation(convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));

    // If we're viewing the deleted conversation, go home
    if (location.pathname.includes(convId)) {
      navigate({ to: "/" });
    }
  }

  return (
    <div className="flex h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Sidebar */}
      <div className="flex w-60 flex-col border-r border-[#30363d] bg-[#161b22]">
        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] py-2 text-sm text-[#e6edf3] hover:border-[#58a6ff] hover:text-[#58a6ff]"
          >
            <span>+</span> New Chat
          </button>
        </div>

        {/* Nav */}
        <div className="px-3 pb-2">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
          >
            Home
          </Link>
        </div>

        {/* Recent Chats */}
        <div className="flex-1 overflow-y-auto px-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#484f58]">
            Recent
          </div>
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                to="/chat/$conversationId"
                params={{ conversationId: conv.id }}
                className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3] [&.active]:bg-[#21262d] [&.active]:text-[#e6edf3]"
              >
                <span className="truncate">
                  {conv.title || "Untitled"}
                </span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="ml-1 hidden shrink-0 rounded p-0.5 text-[#484f58] hover:text-[#f85149] group-hover:block"
                  title="Delete"
                >
                  ×
                </button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
