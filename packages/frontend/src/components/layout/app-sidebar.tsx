import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { Plus, Home, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversationCreate, useConversationDelete, type ConversationResponse } from "@/api";
import { UserProfile } from "./user-profile";

interface AppSidebarProps {
  conversations: ConversationResponse[];
}

export function AppSidebar({ conversations }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const createConv = useConversationCreate();
  const deleteConv = useConversationDelete();

  async function handleNewChat() {
    const conv = await createConv.mutateAsync();
    navigate({ to: "/chat/$conversationId", params: { conversationId: conv.id } });
  }

  function handleDelete(e: React.MouseEvent, convId: string) {
    e.preventDefault();
    e.stopPropagation();
    deleteConv.mutate(convId);
    if (location.pathname.includes(convId)) {
      navigate({ to: "/" });
    }
  }

  return (
    <div className="flex w-60 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="p-3">
        <Button variant="outline" className="w-full gap-2" onClick={handleNewChat} disabled={createConv.isPending}>
          <Plus className="h-4 w-4" /> New Chat
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
        >
          <Home className="h-4 w-4" /> Home
        </Link>
        {/* <Link
          to="/mcp-servers"
          search={{ q: undefined }}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
        >
          <Plug className="h-4 w-4" /> MCP Servers
        </Link> */}
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</div>
        <div className="space-y-0.5">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              to="/chat/$conversationId"
              params={{ conversationId: conv.id }}
              className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              <span className="truncate">{conv.title || "Untitled"}</span>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                className="ml-1 hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Link>
          ))}
        </div>
      </ScrollArea>

      <UserProfile />
    </div>
  );
}
