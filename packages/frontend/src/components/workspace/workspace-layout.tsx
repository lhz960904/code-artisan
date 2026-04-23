import { Suspense } from "react";
import { Header, HeaderSkeleton } from "@/components/workspace/header";
import { ChatPanel } from "@/components/chat/chat-panel";
import { RightPanel } from "@/components/workspace/right-panel";
import { ConversationWsProvider } from "@/components/workspace/conversation-ws-context";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

interface WorkspaceLayoutProps {
  conversationId: string;
}

export function WorkspaceLayout({ conversationId }: WorkspaceLayoutProps) {
  return (
    <ConversationWsProvider key={conversationId} conversationId={conversationId}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Suspense fallback={<HeaderSkeleton />}>
          <Header conversationId={conversationId} />
        </Suspense>
        <div className="flex flex-1 overflow-hidden">
          <ResizablePanelGroup
            orientation="horizontal"
            id="workspace-main"
            panelIds={["chat", "workspace"]}
          >
            <ResizablePanel
              id="chat"
              defaultSize="28%"
              minSize="20%"
              maxSize="50%"
              onResize={({ inPixels }) => {
                document.documentElement.style.setProperty(
                  "--chat-panel-width",
                  `${inPixels}px`,
                );
              }}
            >
              <ChatPanel conversationId={conversationId} />
            </ResizablePanel>
            <ResizableHandle className="mt-11 hover:after:bg-transparent data-[separator=active]:after:bg-transparent" />
            <ResizablePanel id="workspace" defaultSize="72%" minSize="40%">
              <div className="h-full py-2 pr-2">
                <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  <RightPanel conversationId={conversationId} />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </ConversationWsProvider>
  );
}
