import { ChatPanel } from "./chat-panel";
import { FileTree } from "./file-tree";
import { EditorPanel } from "./editor-panel";
import { TerminalPanel } from "./terminal-panel";
import { Toolbar } from "./toolbar";

interface WorkspaceLayoutProps {
  conversationId: string;
}

export function WorkspaceLayout({ conversationId }: WorkspaceLayoutProps) {
  return (
    <div className="flex h-full flex-col">
      <Toolbar conversationId={conversationId} />
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel — left side */}
        <div className="flex w-[380px] shrink-0 flex-col border-r border-[#30363d]">
          <ChatPanel conversationId={conversationId} />
        </div>

        {/* Workspace — right side */}
        <div className="flex flex-1 overflow-hidden">
          {/* File Tree */}
          <div className="w-52 shrink-0 overflow-y-auto border-r border-[#30363d] bg-[#161b22]">
            <FileTree />
          </div>

          {/* Editor + Terminal stack */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <EditorPanel />
            </div>
            <div className="h-48 shrink-0 border-t border-[#30363d]">
              <TerminalPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
