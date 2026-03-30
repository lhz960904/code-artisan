import { useState } from "react";
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

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const { activeTab, openFile } = useWorkspace();
  const isActive = activeTab === node.path;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-[#8b949e] hover:bg-[#21262d]"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <span className="w-3 text-center text-[10px]">{expanded ? "▼" : "▶"}</span>
          <span>{node.name}</span>
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
      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-[#21262d] ${
        isActive ? "bg-[#21262d] text-[#e6edf3]" : "text-[#8b949e]"
      }`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <span className="w-3 text-center text-[10px] text-[#484f58]">·</span>
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
      <div className="mb-2 font-semibold uppercase tracking-wide text-[#484f58]">
        Files
      </div>
      {paths.length === 0 ? (
        <div className="italic text-[#484f58]">No files yet</div>
      ) : (
        tree.map((node) => <TreeItem key={node.path} node={node} depth={0} />)
      )}
    </div>
  );
}
