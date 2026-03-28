import { useState, useEffect } from "react";
import { ChatPanel } from "./chat-panel";
import { FileTree } from "./file-tree";
import { EditorPanel } from "./editor-panel";
import { TerminalPanel } from "./terminal-panel";
import { PreviewPanel } from "./preview-panel";
import { Toolbar } from "./toolbar";
import { useWorkspace } from "../contexts/workspace-context";

type RightTab = "preview" | "code" | "terminal";

interface WorkspaceLayoutProps {
  conversationId: string;
}

export function WorkspaceLayout({ conversationId }: WorkspaceLayoutProps) {
  const { previewUrl } = useWorkspace();
  const [activeTab, setActiveTab] = useState<RightTab>("code");

  // Auto-switch to preview when a preview URL arrives
  useEffect(() => {
    if (previewUrl) setActiveTab("preview");
  }, [previewUrl]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar conversationId={conversationId} />
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel — left side */}
        <div className="flex w-[380px] shrink-0 flex-col border-r border-[#30363d]">
          <ChatPanel conversationId={conversationId} />
        </div>

        {/* Right side: tab bar + content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="flex h-9 items-center gap-1 border-b border-[#30363d] bg-[#161b22] px-3">
            {previewUrl && (
              <TabButton
                active={activeTab === "preview"}
                onClick={() => setActiveTab("preview")}
                title="Preview"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M8 2c-2.8 0-5.2 1.6-6.8 4 1.6 2.4 4 4 6.8 4s5.2-1.6 6.8-4C13.2 3.6 10.8 2 8 2zm0 6.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                </svg>
              </TabButton>
            )}
            <TabButton
              active={activeTab === "code"}
              onClick={() => setActiveTab("code")}
              title="Code"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M4.7 7.3L1.7 4.3l3-3 .6.7L2.8 4.3l2.5 2.3-.6.7zm6.6 0l-.6-.7 2.5-2.3-2.5-2.3.6-.7 3 3-3 3zM7 11L5 1h1l2 10H7z" transform="translate(0 2)" />
              </svg>
            </TabButton>
            <TabButton
              active={activeTab === "terminal"}
              onClick={() => setActiveTab("terminal")}
              title="Terminal"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M1 3l5 4-5 4V3zm6 8h7v1H7v-1z" />
              </svg>
            </TabButton>
          </div>

          {/* Tab Content */}
          <div className="flex flex-1 overflow-hidden">
            {activeTab === "preview" && previewUrl && (
              <div className="flex-1 overflow-hidden">
                <PreviewPanel />
              </div>
            )}
            {activeTab === "code" && (
              <>
                <div className="w-52 shrink-0 overflow-y-auto border-r border-[#30363d] bg-[#161b22]">
                  <FileTree />
                </div>
                <div className="flex-1 overflow-hidden">
                  <EditorPanel />
                </div>
              </>
            )}
            {activeTab === "terminal" && (
              <div className="flex-1 overflow-hidden">
                <TerminalPanel />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
        active
          ? "bg-[#21262d] text-[#e6edf3]"
          : "text-[#484f58] hover:text-[#8b949e]"
      }`}
    >
      {children}
      <span>{title}</span>
    </button>
  );
}
