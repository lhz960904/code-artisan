import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilesPanel } from "@/components/workspace/file-tree";
import { EditorPanel } from "@/components/workspace/editor-panel";
import { TerminalPanel, TerminalToggleButton } from "@/components/workspace/terminal-panel";
import { PreviewPanel } from "@/components/workspace/preview-panel";
import { DatabasePanel } from "@/components/workspace/database-panel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { usePanelRef } from "react-resizable-panels";
import { fileSnapshotsOptions } from "@/api/queries";
import { useWorkspaceStore } from "@/stores/workspace";
import { cn } from "@/lib/utils";

interface RightPanelProps {
  conversationId: string;
}

export function RightPanel({ conversationId }: RightPanelProps) {
  const view = useWorkspaceStore((s) => s.view);
  const setSnapshots = useWorkspaceStore((s) => s.setSnapshots);
  const { data: snapshots } = useQuery(fileSnapshotsOptions(conversationId));

  useEffect(() => {
    if (snapshots) setSnapshots(snapshots);
  }, [snapshots, setSnapshots]);

  // All three views stay mounted; we toggle visibility instead of
  // unmounting so expensive contents (Preview's iframe, CodeView's
  // Monaco + xterm) survive view switches. The iframe in particular
  // would otherwise re-establish TLS + re-download the Vite bundle
  // every time, causing a noticeable blank flash.
  return (
    <div className="relative h-full overflow-hidden">
      <div className={cn("absolute inset-0", view === "preview" ? "block" : "hidden")}>
        <PreviewPanel conversationId={conversationId} />
      </div>
      <div className={cn("absolute inset-0", view === "code" ? "block" : "hidden")}>
        <CodeView conversationId={conversationId} />
      </div>
      <div className={cn("absolute inset-0", view === "database" ? "block" : "hidden")}>
        <DatabasePanel conversationId={conversationId} />
      </div>
    </div>
  );
}

function CodeView({ conversationId }: { conversationId: string }) {
  const terminalPanelRef = usePanelRef();
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);

  const toggleTerminal = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;

    setTerminalCollapsed((prev) => !prev);
    if (panel.isCollapsed()) {
      panel.expand();
      setTerminalCollapsed(false);
    } else {
      panel.collapse();
      setTerminalCollapsed(true);
    }
  }, [terminalPanelRef]);

  return (
    <div className="relative h-full">
      <ResizablePanelGroup orientation="vertical" id="workspace-code-vertical" panelIds={["editor-area", "terminal"]}>
        <ResizablePanel id="editor-area" defaultSize="70%" minSize="30%">
          <ResizablePanelGroup
            orientation="horizontal"
            id="workspace-code-horizontal"
            panelIds={["file-tree", "editor"]}
          >
            <ResizablePanel id="file-tree" defaultSize="22%" minSize="10%" maxSize="40%">
              <div className="h-full bg-card">
                <FilesPanel />
              </div>
            </ResizablePanel>
            <ResizableHandle className="w-px bg-border" />
            <ResizablePanel id="editor" defaultSize="78%">
              <EditorPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle className="aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:bg-border" />
        <ResizablePanel
          id="terminal"
          defaultSize="30%"
          minSize="15%"
          collapsible
          panelRef={terminalPanelRef}
          onResize={(size) => {
            setTerminalCollapsed(size.asPercentage === 0);
          }}
        >
          <TerminalPanel
            conversationId={conversationId}
            collapsed={terminalCollapsed}
            onToggleCollapse={toggleTerminal}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      {terminalCollapsed && (
        <div className="absolute bottom-0 right-4">
          <TerminalToggleButton onClick={toggleTerminal} />
        </div>
      )}
    </div>
  );
}
