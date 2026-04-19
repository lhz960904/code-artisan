import { create } from "zustand";
import type { FileSnapshot } from "@/api";

interface TerminalEntry {
  command: string;
  output: string;
  error?: string;
}

export type WorkspaceView = "preview" | "code" | "database";

interface WorkspaceState {
  files: Map<string, string>;
  openTabs: string[];
  activeTab: string | null;
  terminalHistory: TerminalEntry[];
  previewUrl: string | null;
  view: WorkspaceView;

  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  appendTerminal: (entry: TerminalEntry) => void;
  setPreviewUrl: (url: string | null) => void;
  setView: (view: WorkspaceView) => void;
  setSnapshots: (snapshots: FileSnapshot[]) => void;
  reset: () => void;
}

const freshState = () => ({
  files: new Map<string, string>(),
  openTabs: [] as string[],
  activeTab: null as string | null,
  terminalHistory: [] as TerminalEntry[],
  previewUrl: null as string | null,
  view: "code" as WorkspaceView,
});

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...freshState(),

  openFile: (path) =>
    set((s) => ({
      openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path],
      activeTab: path,
    })),

  closeTab: (path) =>
    set((s) => {
      const next = s.openTabs.filter((p) => p !== path);
      const nextActive =
        s.activeTab === path ? (next.length > 0 ? next[next.length - 1] : null) : s.activeTab;
      return { openTabs: next, activeTab: nextActive };
    }),

  setActiveTab: (path) => set({ activeTab: path }),

  updateFile: (path, content) =>
    set((s) => {
      const next = new Map(s.files);
      next.set(path, content);
      return { files: next };
    }),

  deleteFile: (path) =>
    set((s) => {
      if (!s.files.has(path)) return s;
      const nextFiles = new Map(s.files);
      nextFiles.delete(path);
      const nextTabs = s.openTabs.filter((p) => p !== path);
      const nextActive =
        s.activeTab === path ? (nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null) : s.activeTab;
      return { files: nextFiles, openTabs: nextTabs, activeTab: nextActive };
    }),

  appendTerminal: (entry) =>
    set((s) => ({ terminalHistory: [...s.terminalHistory, entry] })),

  setPreviewUrl: (url) => set({ previewUrl: url }),

  setView: (view) => set({ view }),

  setSnapshots: (snapshots) => {
    const fileMap = new Map<string, string>();
    for (const s of snapshots) fileMap.set(s.path, s.content);
    set({ files: fileMap });
  },

  reset: () => set(freshState()),
}));
