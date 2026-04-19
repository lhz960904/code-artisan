import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileTree } from "@/components/workspace/file-tree";
import { EditorPanel } from "@/components/workspace/editor-panel";
import { TerminalPanel } from "@/components/workspace/terminal-panel";
import { PreviewPanel } from "@/components/workspace/preview-panel";
import { DatabasePanel } from "@/components/workspace/database-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { fileSnapshotsOptions } from "@/api/queries";
import { useWorkspaceStore, type WorkspaceView } from "@/stores/workspace";

interface RightPanelProps {
  conversationId: string;
}

export function RightPanel({ conversationId }: RightPanelProps) {
  const view = useWorkspaceStore((s) => s.view);
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);
  const setSnapshots = useWorkspaceStore((s) => s.setSnapshots);
  const { data: snapshots } = useQuery(fileSnapshotsOptions(conversationId));

  useEffect(() => {
    if (snapshots) setSnapshots(snapshots);
  }, [snapshots, setSnapshots]);

  const effective: WorkspaceView = view === "preview" && !previewUrl ? "code" : view;

  return (
    <div className="h-full overflow-hidden">
      {effective === "preview" && <PreviewPanel />}
      {effective === "code" && <CodeView />}
      {effective === "database" && <DatabasePanel />}
    </div>
  );
}

function CodeView() {
  return (
    <ResizablePanelGroup orientation="vertical" id="workspace-code-vertical" panelIds={["editor-area", "terminal"]}>
      <ResizablePanel id="editor-area" defaultSize="70%" minSize="30%">
        <ResizablePanelGroup
          orientation="horizontal"
          id="workspace-code-horizontal"
          panelIds={["file-tree", "editor"]}
        >
          <ResizablePanel id="file-tree" defaultSize="22%" minSize="10%" maxSize="40%">
            <div className="h-full overflow-y-auto bg-card">
              <FileTree />
            </div>
          </ResizablePanel>
          <ResizableHandle className="w-px bg-border" />
          <ResizablePanel id="editor" defaultSize="78%">
            <EditorPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle className="aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:bg-border" />
      <ResizablePanel id="terminal" defaultSize="30%" minSize="15%">
        <TerminalPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
