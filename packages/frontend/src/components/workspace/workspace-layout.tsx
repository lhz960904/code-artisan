import { Header } from "@/components/layout/header";
import { ChatPanel } from "@/components/chat/chat-panel";
import { RightPanel } from "@/components/workspace/right-panel";
import type { ConversationResponse, QuotaResponse } from "@/api";
import type { StoredMessage } from "@code-artisan/shared";

interface WorkspaceLayoutProps {
  conversationId: string;
  initialMessage?: string;
  conversation: ConversationResponse;
  quota: QuotaResponse;
  initialMessages: StoredMessage[];
}

export function WorkspaceLayout({
  conversationId,
  initialMessage,
  conversation,
  quota,
  initialMessages,
}: WorkspaceLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header conversationId={conversationId} conversation={conversation} quota={quota} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[400px] shrink-0 flex-col border-r border-border">
          <div className="min-h-0 flex-1">
            <ChatPanel
              conversationId={conversationId}
              initialMessage={initialMessage}
              initialMessages={initialMessages}
            />
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <RightPanel />
        </div>
      </div>
    </div>
  );
}
