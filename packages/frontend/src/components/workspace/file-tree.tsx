import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  FileCode2,
  FileJson,
  FileType,
  Image,
  FileTerminal,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/contexts/workspace-context";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of paths.sort()) {
    const parts = filePath.startsWith("/") ? filePath.slice(1).split("/") : filePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const partialPath = "/" + parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          path: isLast ? filePath : partialPath,
          isDir: !isLast,
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  return root;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const iconClass = "h-3.5 w-3.5 shrink-0";

  switch (ext) {
    case "ts":
    case "tsx":
      return <FileCode2 className={cn(iconClass, "text-blue-400")} />;
    case "js":
    case "jsx":
      return <FileCode2 className={cn(iconClass, "text-yellow-400")} />;
    case "py":
      return <FileCode2 className={cn(iconClass, "text-green-400")} />;
    case "rs":
      return <FileCode2 className={cn(iconClass, "text-orange-400")} />;
    case "go":
      return <FileCode2 className={cn(iconClass, "text-cyan-400")} />;
    case "json":
      return <FileJson className={cn(iconClass, "text-yellow-300")} />;
    case "html":
      return <FileCode2 className={cn(iconClass, "text-orange-300")} />;
    case "css":
    case "scss":
      return <FileCode2 className={cn(iconClass, "text-purple-400")} />;
    case "md":
    case "mdx":
      return <FileType className={cn(iconClass, "text-muted-foreground")} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return <Image className={cn(iconClass, "text-green-300")} />;
    case "sh":
    case "bash":
    case "zsh":
      return <FileTerminal className={cn(iconClass, "text-muted-foreground")} />;
    case "yml":
    case "yaml":
    case "toml":
    case "env":
      return <Settings className={cn(iconClass, "text-muted-foreground")} />;
    default:
      return <FileText className={cn(iconClass, "text-muted-foreground")} />;
  }
}

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const { activeTab, openFile } = useWorkspace();
  const isActive = activeTab === node.path;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <Folder className={cn("h-3.5 w-3.5 shrink-0", expanded ? "text-primary" : "text-muted-foreground")} />
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
        "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent hover:text-accent-foreground",
        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <span className="w-3 shrink-0" />
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function FileTree() {
  const { files } = useWorkspace();
  const paths = Array.from(files.keys());
  const tree = buildTree(paths);

  return (
    <div className="p-2 text-xs">
      <div className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">
        Files
      </div>
      {paths.length === 0 ? (
        <div className="px-1 italic text-muted-foreground opacity-60">No files yet</div>
      ) : (
        tree.map((node) => <TreeItem key={node.path} node={node} depth={0} />)
      )}
    </div>
  );
}
