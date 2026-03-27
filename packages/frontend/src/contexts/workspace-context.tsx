import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { getFileSnapshots } from "../lib/api";

interface TerminalEntry {
  command: string;
  output: string;
  error?: string;
}

interface WorkspaceState {
  files: Map<string, string>;
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
      // Switch to adjacent tab if closing active
      setActiveTabState((active) => {
        if (active !== path) return active;
        return next.length > 0 ? next[next.length - 1] : null;
      });
      return next;
    });
  }, []);

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
