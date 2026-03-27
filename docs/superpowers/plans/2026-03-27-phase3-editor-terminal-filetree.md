# Phase 3: Editor + File Tree + Terminal Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the chat-only workspace into a full IDE layout with Monaco editor (multi-tab), file tree, terminal panel (xterm.js), and toolbar — all driven by Realtime events from the agent loop.

**Architecture:** Chat page becomes a 3-column layout: sidebar (already exists), chat panel (left), workspace panel (right = file tree + editor + terminal). A React context (`WorkspaceContext`) manages shared state: open files, active tab, terminal output. Realtime events from `useConversationEvents` drive side effects: `write_file` → open file in editor, `execute_command` → append terminal output, `list_files` → refresh file tree. Backend adds a `/files` endpoint to load initial file snapshots.

**Tech Stack:** Monaco Editor (`@monaco-editor/react`), xterm.js (`@xterm/xterm` + `@xterm/addon-fit`), existing Supabase Realtime subscription, Hono.js backend

---

## File Structure

```
packages/
├── backend/src/
│   └── routes/
│       └── conversations.ts            # Modify: add GET /:id/files endpoint
├── frontend/src/
│   ├── lib/
│   │   └── api.ts                      # Modify: add getFileSnapshots()
│   ├── contexts/
│   │   └── workspace-context.tsx       # Create: shared workspace state (files, tabs, terminal)
│   ├── routes/
│   │   └── chat.$conversationId.tsx    # Modify: use WorkspaceProvider + new layout
│   └── components/
│       ├── workspace-layout.tsx        # Create: 3-panel grid (chat | file-tree | editor+terminal)
│       ├── file-tree.tsx               # Create: file explorer from snapshots + events
│       ├── editor-panel.tsx            # Create: Monaco editor with multi-tab
│       ├── terminal-panel.tsx          # Create: xterm.js terminal output
│       ├── toolbar.tsx                 # Create: session title, mode toggle, preview link
│       ├── chat-panel.tsx              # Modify: integrate with WorkspaceContext for event side effects
│       └── tool-call-card.tsx          # No changes
```

---

### Task 1: Backend — Add GET /files endpoint

**Files:**
- Modify: `packages/backend/src/routes/conversations.ts`

- [ ] **Step 1: Add file snapshots endpoint**

Add this route after the existing `GET /:id/events` handler in `packages/backend/src/routes/conversations.ts`:

```typescript
// Get file snapshots for conversation (for editor initial load)
conversationsRouter.get("/:id/files", async (c) => {
  const id = c.req.param("id");

  const result = await db
    .select({
      path: fileSnapshots.path,
      content: fileSnapshots.content,
      updatedAt: fileSnapshots.updatedAt,
    })
    .from(fileSnapshots)
    .where(eq(fileSnapshots.conversationId, id));

  return c.json(result);
});
```

- [ ] **Step 2: Verify endpoint works**

Run: `cd packages/backend && bun run dev`

Test with curl (use an existing conversation ID or create one):
```bash
curl http://localhost:3001/api/conversations/<conv-id>/files
```
Expected: `[]` (empty array, no files yet) or file snapshot objects.

- [ ] **Step 3: Add frontend API function**

Add to the end of `packages/frontend/src/lib/api.ts`:

```typescript
export interface FileSnapshot {
  path: string;
  content: string;
  updatedAt: string;
}

export async function getFileSnapshots(conversationId: string): Promise<FileSnapshot[]> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/files`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

---

### Task 2: Install frontend dependencies

**Files:**
- Modify: `packages/frontend/package.json`

- [ ] **Step 1: Install Monaco Editor React wrapper**

```bash
cd packages/frontend && pnpm add @monaco-editor/react
```

- [ ] **Step 2: Install xterm.js and fit addon**

```bash
cd packages/frontend && pnpm add @xterm/xterm @xterm/addon-fit
```

- [ ] **Step 3: Verify dev server still starts**

```bash
cd packages/frontend && pnpm dev
```
Expected: Vite dev server starts without errors on http://localhost:5173

---

### Task 3: Create WorkspaceContext

**Files:**
- Create: `packages/frontend/src/contexts/workspace-context.tsx`

- [ ] **Step 1: Create the context file**

```typescript
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { getFileSnapshots, type FileSnapshot } from "../lib/api";

interface TerminalEntry {
  command: string;
  output: string;
  error?: string;
}

interface WorkspaceState {
  files: Map<string, string>; // path → content
  openTabs: string[];
  activeTab: string | null;
  terminalHistory: TerminalEntry[];
  previewUrl: string | null;
}

interface WorkspaceContextValue extends WorkspaceState {
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateFile: (path: string, content: string) => void;
  appendTerminal: (entry: TerminalEntry) => void;
  setPreviewUrl: (url: string | null) => void;
  loadSnapshots: (conversationId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<Map<string, string>>(new Map());
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTabState] = useState<string | null>(null);
  const [terminalHistory, setTerminalHistory] = useState<TerminalEntry[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const openFile = useCallback((path: string) => {
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveTabState(path);
  }, []);

  const closeTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((p) => p !== path);
      return next;
    });
    setActiveTabState((prev) => {
      if (prev !== path) return prev;
      // Switch to adjacent tab
      const tabs = openTabs.filter((p) => p !== path);
      return tabs.length > 0 ? tabs[tabs.length - 1] : null;
    });
  }, [openTabs]);

  const setActiveTab = useCallback((path: string) => {
    setActiveTabState(path);
  }, []);

  const updateFile = useCallback((path: string, content: string) => {
    setFiles((prev) => {
      const next = new Map(prev);
      next.set(path, content);
      return next;
    });
  }, []);

  const appendTerminal = useCallback((entry: TerminalEntry) => {
    setTerminalHistory((prev) => [...prev, entry]);
  }, []);

  const loadSnapshots = useCallback(async (conversationId: string) => {
    const snapshots = await getFileSnapshots(conversationId);
    const fileMap = new Map<string, string>();
    for (const s of snapshots) {
      fileMap.set(s.path, s.content);
    }
    setFiles(fileMap);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        files,
        openTabs,
        activeTab,
        terminalHistory,
        previewUrl,
        openFile,
        closeTab,
        setActiveTab,
        updateFile,
        appendTerminal,
        setPreviewUrl,
        loadSnapshots,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
```

- [ ] **Step 2: Verify no type errors**

```bash
cd packages/frontend && npx tsc --noEmit
```
Expected: No errors (or only pre-existing ones).

---

### Task 4: Create Workspace Layout

**Files:**
- Create: `packages/frontend/src/components/workspace-layout.tsx`
- Modify: `packages/frontend/src/routes/chat.$conversationId.tsx`

- [ ] **Step 1: Create workspace-layout.tsx**

```typescript
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
```

- [ ] **Step 2: Create stub components so the layout compiles**

Create `packages/frontend/src/components/file-tree.tsx`:

```typescript
export function FileTree() {
  return (
    <div className="p-2 text-xs text-[#8b949e]">
      <div className="mb-2 font-semibold uppercase tracking-wide text-[#484f58]">
        Files
      </div>
      <div className="italic">No files yet</div>
    </div>
  );
}
```

Create `packages/frontend/src/components/editor-panel.tsx`:

```typescript
export function EditorPanel() {
  return (
    <div className="flex h-full items-center justify-center bg-[#0d1117] text-sm text-[#484f58]">
      Select a file to edit
    </div>
  );
}
```

Create `packages/frontend/src/components/terminal-panel.tsx`:

```typescript
export function TerminalPanel() {
  return (
    <div className="h-full bg-[#0d1117] p-2 font-mono text-xs text-[#8b949e]">
      <span className="text-[#484f58]">Terminal</span>
    </div>
  );
}
```

Create `packages/frontend/src/components/toolbar.tsx`:

```typescript
interface ToolbarProps {
  conversationId: string;
}

export function Toolbar({ conversationId }: ToolbarProps) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4">
      <div className="text-sm font-medium text-[#e6edf3]">Workspace</div>
      <div className="flex items-center gap-2 text-xs text-[#8b949e]">
        {conversationId.slice(0, 8)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update chat route to use WorkspaceLayout**

Replace the content of `packages/frontend/src/routes/chat.$conversationId.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceProvider } from "../contexts/workspace-context";
import { WorkspaceLayout } from "../components/workspace-layout";

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();

  return (
    <WorkspaceProvider>
      <WorkspaceLayout conversationId={conversationId} />
    </WorkspaceProvider>
  );
}
```

- [ ] **Step 4: Verify layout renders**

```bash
cd packages/frontend && pnpm dev
```

Open http://localhost:5173, create a new chat. Expected: 3-panel layout visible — chat on left, "Files" panel in middle, "Select a file" placeholder on right, terminal bar at bottom, toolbar at top.

---

### Task 5: Implement File Tree

**Files:**
- Modify: `packages/frontend/src/components/file-tree.tsx`

- [ ] **Step 1: Implement file tree with folder grouping**

Replace `packages/frontend/src/components/file-tree.tsx`:

```typescript
import { useState } from "react";
import { useWorkspace } from "../contexts/workspace-context";

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
```

- [ ] **Step 2: Verify renders correctly**

```bash
cd packages/frontend && pnpm dev
```

Open a chat. The file tree should show "No files yet". Once the agent creates files (via tool events), the tree should populate.

---

### Task 6: Implement Editor Panel with Monaco

**Files:**
- Modify: `packages/frontend/src/components/editor-panel.tsx`

- [ ] **Step 1: Implement multi-tab Monaco editor**

Replace `packages/frontend/src/components/editor-panel.tsx`:

```typescript
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
```

- [ ] **Step 2: Verify Monaco renders**

```bash
cd packages/frontend && pnpm dev
```

Open a chat, manually test: once agent writes a file and the file tree populates, clicking a file should open it in a tab with Monaco syntax highlighting. For now, just verify the "Select a file to edit" placeholder shows without errors.

---

### Task 7: Implement Terminal Panel with xterm.js

**Files:**
- Modify: `packages/frontend/src/components/terminal-panel.tsx`

- [ ] **Step 1: Implement xterm.js terminal**

Replace `packages/frontend/src/components/terminal-panel.tsx`:

```typescript
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useWorkspace } from "../contexts/workspace-context";

export function TerminalPanel() {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenCountRef = useRef(0);
  const { terminalHistory } = useWorkspace();

  // Initialize terminal
  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#e6edf3",
        selectionBackground: "#264f78",
      },
      fontSize: 12,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(termRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
      writtenCountRef.current = 0;
    };
  }, []);

  // Write new terminal entries
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    const newEntries = terminalHistory.slice(writtenCountRef.current);
    for (const entry of newEntries) {
      term.writeln(`\x1b[32m$ ${entry.command}\x1b[0m`);
      if (entry.output) {
        for (const line of entry.output.split("\n")) {
          term.writeln(line);
        }
      }
      if (entry.error) {
        for (const line of entry.error.split("\n")) {
          term.writeln(`\x1b[31m${line}\x1b[0m`);
        }
      }
      term.writeln("");
    }
    writtenCountRef.current = terminalHistory.length;
  }, [terminalHistory]);

  return <div ref={termRef} className="h-full w-full" />;
}
```

- [ ] **Step 2: Verify terminal renders**

```bash
cd packages/frontend && pnpm dev
```

Open a chat. The terminal panel at the bottom should show a dark background. No content yet until agent runs commands.

---

### Task 8: Wire Events to Workspace Panels

**Files:**
- Modify: `packages/frontend/src/components/chat-panel.tsx`

This is the critical wiring step. When events arrive via Realtime, the chat panel processes them and also updates the workspace context (files, terminal, preview URL).

- [ ] **Step 1: Update ChatPanel to process events into workspace state**

Replace `packages/frontend/src/components/chat-panel.tsx`:

```typescript
import { useState, useRef, useEffect } from "react";
import { sendMessage } from "../lib/api";
import { useConversationEvents, type RealtimeEvent } from "../lib/supabase";
import { ToolCallCard } from "./tool-call-card";
import { useWorkspace } from "../contexts/workspace-context";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const { events } = useConversationEvents(conversationId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedSeqRef = useRef(0);
  const { updateFile, openFile, appendTerminal, setPreviewUrl, loadSnapshots } = useWorkspace();

  // Load initial file snapshots
  useEffect(() => {
    loadSnapshots(conversationId);
  }, [conversationId, loadSnapshots]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Process events into workspace state
  useEffect(() => {
    for (const event of events) {
      if (event.seq <= processedSeqRef.current) continue;
      processedSeqRef.current = event.seq;

      const data = event.data as Record<string, unknown>;

      if (event.type === "tool_call") {
        const tool = data.tool as string;
        const args = data.args as Record<string, string>;

        if (tool === "write_file" && args.path && args.content) {
          updateFile(args.path, args.content);
          openFile(args.path);
        }
      }

      if (event.type === "tool_result") {
        const tool = data.tool as string;
        if (tool === "execute_command") {
          // Find the matching tool_call to get the command
          const callEvent = events.find(
            (e) => e.type === "tool_call" && e.seq === event.seq - 1,
          );
          const command = callEvent
            ? ((callEvent.data as Record<string, unknown>).args as Record<string, string>)?.command ?? "command"
            : "command";

          appendTerminal({
            command,
            output: (data.output as string) ?? "",
            error: (data.error as string) || undefined,
          });
        }

        if (tool === "read_file") {
          // Find the matching tool_call to get path
          const callEvent = events.find(
            (e) => e.type === "tool_call" && e.seq === event.seq - 1,
          );
          const path = callEvent
            ? ((callEvent.data as Record<string, unknown>).args as Record<string, string>)?.path
            : null;

          if (path && data.output) {
            updateFile(path, data.output as string);
            openFile(path);
          }
        }

        if (tool === "list_files") {
          // list_files results don't need special handling — files are tracked via write_file
        }
      }

      if (event.type === "preview_url") {
        setPreviewUrl(data.url as string);
      }
    }
  }, [events, updateFile, openFile, appendTerminal, setPreviewUrl]);

  // Check if agent is currently processing
  const isAgentRunning =
    events.length > 0 &&
    !["ai_text", "error"].includes(events[events.length - 1].type) &&
    events.some((e) => e.type === "user_message");

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);

    try {
      await sendMessage(conversationId, content);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }

  // Pair tool_call events with their tool_result
  function getToolResult(toolCallEvent: RealtimeEvent): RealtimeEvent | undefined {
    const idx = events.indexOf(toolCallEvent);
    for (let i = idx + 1; i < events.length; i++) {
      if (events[i].type === "tool_result") return events[i];
      if (events[i].type === "tool_call") break;
    }
    return undefined;
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {events.map((event) => {
            switch (event.type) {
              case "user_message":
                return (
                  <div key={event.id} className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
                      You
                    </div>
                    <div className="text-sm leading-relaxed text-[#e6edf3]">
                      {(event.data as { content: string }).content}
                    </div>
                  </div>
                );
              case "ai_text":
                return (
                  <div key={event.id} className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#58a6ff]">
                      Agent
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#e6edf3]">
                      {(event.data as { content: string }).content}
                    </div>
                  </div>
                );
              case "tool_call":
                return (
                  <ToolCallCard
                    key={event.id}
                    event={event}
                    result={getToolResult(event)}
                  />
                );
              case "error":
                return (
                  <div
                    key={event.id}
                    className="rounded-md border border-[#f85149]/30 bg-[#f85149]/10 p-3 text-sm text-[#f85149]"
                  >
                    Error: {(event.data as { content: string }).content}
                  </div>
                );
              default:
                return null;
            }
          })}
          {isAgentRunning && (
            <div className="animate-pulse text-sm text-[#8b949e]">
              Agent is working...
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-[#30363d] p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your task..."
            disabled={isAgentRunning}
            className="flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#484f58] outline-none focus:border-[#58a6ff] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || isAgentRunning || !input.trim()}
            className="rounded-md bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify event wiring works end-to-end**

1. Start backend: `cd packages/backend && bun run dev`
2. Start frontend: `cd packages/frontend && pnpm dev`
3. Open http://localhost:5173, create a new chat
4. Send a message like "Create a hello world Python file and run it"
5. Expected:
   - Chat shows events (user_message, tool_call cards, ai_text)
   - File tree populates with the created file
   - Clicking the file opens it in Monaco editor
   - Terminal shows the command output

---

### Task 9: Implement Toolbar

**Files:**
- Modify: `packages/frontend/src/components/toolbar.tsx`

- [ ] **Step 1: Implement toolbar with title and preview link**

Replace `packages/frontend/src/components/toolbar.tsx`:

```typescript
import { useEffect, useState } from "react";
import { getConversation, type ConversationResponse } from "../lib/api";
import { useWorkspace } from "../contexts/workspace-context";

interface ToolbarProps {
  conversationId: string;
}

export function Toolbar({ conversationId }: ToolbarProps) {
  const [conv, setConv] = useState<ConversationResponse | null>(null);
  const { previewUrl } = useWorkspace();

  useEffect(() => {
    getConversation(conversationId).then(setConv).catch(console.error);
  }, [conversationId]);

  return (
    <div className="flex h-10 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[#e6edf3]">
          {conv?.title || "Untitled"}
        </span>
        <span className="rounded bg-[#21262d] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#8b949e]">
          {conv?.mode || "yolo"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1 text-xs text-[#58a6ff] hover:border-[#58a6ff]"
          >
            Preview ↗
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify toolbar renders**

Open a chat. Toolbar should show conversation title (or "Untitled") and mode badge. Preview link appears only when agent writes a `preview_url` event.

---

### Task 10: Final Integration Verification

- [ ] **Step 1: Full end-to-end test**

1. Start backend: `cd packages/backend && bun run dev`
2. Start frontend: `cd packages/frontend && pnpm dev`
3. Create a new conversation from the home page
4. Send: "Write a Python script that prints the fibonacci sequence up to 20 terms and run it"
5. Verify:
   - Chat panel shows all events (user message, tool cards, AI response)
   - File tree shows `main.py` (or whatever file was created)
   - Clicking the file opens it in Monaco with Python syntax highlighting
   - Terminal shows `$ python main.py` and the fibonacci output
   - Toolbar shows the auto-generated title
   - Tab close button works
   - File tree folder expand/collapse works

- [ ] **Step 2: Verify type check passes**

```bash
cd packages/frontend && npx tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 3: Verify build succeeds**

```bash
cd packages/frontend && pnpm build
```
Expected: Build completes without errors.
