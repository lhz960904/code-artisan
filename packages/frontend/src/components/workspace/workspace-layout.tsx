import { Header } from "@/components/layout/header";
import { ChatPanel } from "@/components/chat/chat-panel";
import { RightPanel } from "@/components/workspace/right-panel";

interface WorkspaceLayoutProps {
  conversationId: string;
}

export function WorkspaceLayout({ conversationId }: WorkspaceLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header conversationId={conversationId} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[400px] shrink-0 flex-col border-r border-border">
          <div className="min-h-0 flex-1">
            <ChatPanel conversationId={conversationId} />
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <RightPanel />
        </div>
      </div>
    </div>
  );
}
