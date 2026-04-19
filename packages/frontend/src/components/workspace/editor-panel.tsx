import { FileCode2 } from "lucide-react";
import Editor from "@monaco-editor/react";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTheme } from "@/contexts/theme-context";

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    json: "json",
    html: "html",
    css: "css",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    bash: "shell",
    toml: "ini",
    sql: "sql",
    xml: "xml",
    svg: "xml",
  };
  return langMap[ext ?? ""] ?? "plaintext";
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function EditorPanel() {
  const { files, openTabs, activeTab, setActiveTab, closeTab } = useWorkspaceStore(
    useShallow((s) => ({
      files: s.files,
      openTabs: s.openTabs,
      activeTab: s.activeTab,
      setActiveTab: s.setActiveTab,
      closeTab: s.closeTab,
    })),
  );
  const { resolved } = useTheme();
  const content = activeTab ? files.get(activeTab) ?? "" : "";

  if (openTabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <FileCode2 className="h-10 w-10 opacity-30" />
        <p className="text-sm">Select a file to view</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tabs */}
      <div className="flex h-9 shrink-0 overflow-x-auto border-b border-border bg-card">
        {openTabs.map((path) => (
          <button
            key={path}
            onClick={() => setActiveTab(path)}
            className={cn(
              "group flex shrink-0 items-center gap-1.5 border-r border-border px-3 text-xs",
              activeTab === path
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span>{fileName(path)}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(path);
              }}
              className="ml-1 hidden rounded px-0.5 text-muted-foreground hover:text-destructive group-hover:inline"
            >
              ×
            </span>
          </button>
        ))}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          theme={resolved === "dark" ? "vs-dark" : "vs"}
          language={activeTab ? getLanguage(activeTab) : "plaintext"}
          value={content}
          path={activeTab ?? undefined}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}
