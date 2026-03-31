import { useState, useEffect } from "react";
import { Eye, Code2, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileTree } from "@/components/workspace/file-tree";
import { EditorPanel } from "@/components/workspace/editor-panel";
import { TerminalPanel } from "@/components/workspace/terminal-panel";
import { PreviewPanel } from "@/components/workspace/preview-panel";
import { useWorkspace } from "@/contexts/workspace-context";

type Tab = "preview" | "code" | "terminal";

export function RightPanel() {
  const { previewUrl } = useWorkspace();
  const [activeTab, setActiveTab] = useState<Tab>("code");

  useEffect(() => {
    if (previewUrl) setActiveTab("preview");
  }, [previewUrl]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab Bar */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card px-3">
        {previewUrl && (
          <TabBtn active={activeTab === "preview"} onClick={() => setActiveTab("preview")}>
            <Eye className="h-3.5 w-3.5" /> Preview
          </TabBtn>
        )}
        <TabBtn active={activeTab === "code"} onClick={() => setActiveTab("code")}>
          <Code2 className="h-3.5 w-3.5" /> Code
        </TabBtn>
        <TabBtn active={activeTab === "terminal"} onClick={() => setActiveTab("terminal")}>
          <TerminalIcon className="h-3.5 w-3.5" /> Terminal
        </TabBtn>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "preview" && previewUrl && <PreviewPanel />}
        {activeTab === "code" && <CodeView />}
        {activeTab === "terminal" && <TerminalPanel />}
      </div>
    </div>
  );
}

function CodeView() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-52 shrink-0 overflow-y-auto border-r border-border bg-card">
          <FileTree />
        </div>
        <div className="flex-1 overflow-hidden">
          <EditorPanel />
        </div>
      </div>
      <div className="h-[200px] shrink-0 border-t border-border">
        <TerminalPanel />
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
