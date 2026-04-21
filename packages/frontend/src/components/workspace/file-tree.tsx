import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Network,
  Folder,
  FolderOpen,
  FileText,
  FileCode2,
  FileJson,
  FileType,
  Image,
  FileTerminal,
  Settings,
  Search as SearchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { useWorkspaceStore } from "@/stores/workspace";
import { SANDBOX_WORKSPACE_ROOT, SANDBOX_IGNORED_DIRS } from "@code-artisan/shared";
import { Button } from "@/components/ui/button";
import { FileSearch } from "./file-search";

const IGNORED_SET = new Set<string>(SANDBOX_IGNORED_DIRS);

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) if (node.isDir) sortNodes(node.children);
  return nodes;
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const prefix = SANDBOX_WORKSPACE_ROOT + "/";

  for (const filePath of paths) {
    if (!filePath.startsWith(prefix)) continue;
    const relPath = filePath.slice(prefix.length);
    if (!relPath) continue;
    const parts = relPath.split("/");
    if (parts.some((p) => IGNORED_SET.has(p))) continue;

    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const partialAbs = `${SANDBOX_WORKSPACE_ROOT}/${parts.slice(0, i + 1).join("/")}`;

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          path: isLast ? filePath : partialAbs,
          isDir: !isLast,
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  return sortNodes(root);
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const iconClass = "h-3.5 w-3.5 shrink-0 text-muted-foreground";

  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "py":
    case "rs":
    case "go":
    case "html":
    case "css":
    case "scss":
      return <FileCode2 className={iconClass} />;
    case "json":
      return <FileJson className={iconClass} />;
    case "md":
    case "mdx":
      return <FileType className={iconClass} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return <Image className={iconClass} />;
    case "sh":
    case "bash":
    case "zsh":
      return <FileTerminal className={iconClass} />;
    case "yml":
    case "yaml":
    case "toml":
    case "env":
      return <Settings className={iconClass} />;
    default:
      return <FileText className={iconClass} />;
  }
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
}

function TreeItem({ node, depth }: TreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const { activeTab, openFile } = useWorkspaceStore(
    useShallow((s) => ({ activeTab: s.activeTab, openFile: s.openFile })),
  );
  const isActive = activeTab === node.path;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => openFile(node.path)}
      className={cn(
        "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm",
        isActive
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <span className="w-3 shrink-0" />
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function FileTreeView() {
  const files = useWorkspaceStore((s) => s.files);
  const paths = Array.from(files.keys());
  const tree = buildTree(paths);

  if (paths.length === 0) {
    return (
      <div className="p-2">
        <div className="px-1 italic text-muted-foreground opacity-60 text-sm">No files yet</div>
      </div>
    );
  }

  return (
    <div className="p-2 text-sm">
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}

type FilesPanelTab = "files" | "search";

export function FilesPanel() {
  const [tab, setTab] = useState<FilesPanelTab>("files");

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 flex h-9 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
        <Button
          variant={tab === "files" ? "secondary" : "ghost"}
          size="xs"
          onClick={() => setTab("files")}
        >
          <Network className="-rotate-90" />
          <span>Files</span>
        </Button>
        <Button
          variant={tab === "search" ? "secondary" : "ghost"}
          size="xs"
          onClick={() => setTab("search")}
        >
          <SearchIcon />
          <span>Search</span>
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "files" ? <FileTreeView /> : <FileSearch />}
      </div>
    </div>
  );
}
