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
        <div className="w-[400px] shrink-0 border-r border-border">
          <ChatPanel conversationId={conversationId} />
        </div>
        <div className="flex-1 overflow-hidden">
          <RightPanel />
        </div>
      </div>
    </div>
  );
}
