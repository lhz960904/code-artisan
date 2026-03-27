import Editor from "@monaco-editor/react";
import { useWorkspace } from "../contexts/workspace-context";

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
  const { files, openTabs, activeTab, setActiveTab, closeTab } = useWorkspace();
  const content = activeTab ? files.get(activeTab) ?? "" : "";

  if (openTabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0d1117] text-sm text-[#484f58]">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      {/* Tabs */}
      <div className="flex shrink-0 overflow-x-auto border-b border-[#30363d] bg-[#161b22]">
        {openTabs.map((path) => (
          <button
            key={path}
            onClick={() => setActiveTab(path)}
            className={`group flex shrink-0 items-center gap-1.5 border-r border-[#30363d] px-3 py-1.5 text-xs ${
              activeTab === path
                ? "bg-[#0d1117] text-[#e6edf3]"
                : "text-[#8b949e] hover:bg-[#1c2128]"
            }`}
          >
            <span>{fileName(path)}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(path);
              }}
              className="ml-1 hidden rounded px-0.5 text-[#484f58] hover:text-[#f85149] group-hover:inline"
            >
              ×
            </span>
          </button>
        ))}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          theme="vs-dark"
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
