import { create } from "zustand";
import type {
  BrowserError,
  ParentToIframeMessage,
  SelectedElement,
} from "@code-artisan/shared";
import type { FileSnapshot } from "@/api";

const BROWSER_ERROR_BUFFER_LIMIT = 50;

type SendableParentMessage =
  ParentToIframeMessage extends infer M
    ? M extends { brand: unknown }
      ? Omit<M, "brand">
      : never
    : never;
export type IframeBridgeSender = (message: SendableParentMessage) => void;

const WORKSPACE_VIEWS = ["preview", "code", "database"] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

interface PendingReveal {
  path: string;
  line: number;
}

interface WorkspaceState {
  files: Map<string, string>;
  snapshotsLoaded: boolean;
  openTabs: string[];
  activeTab: string | null;
  previewUrl: string | null;
  pendingChatMessage: string | null;
  view: WorkspaceView;
  pendingReveal: PendingReveal | null;
  browserErrors: BrowserError[];
  iframeRuntimeReady: boolean;
  selectedElement: SelectedElement | null;
  pickModeActive: boolean;
  iframeBridgeSend: IframeBridgeSender | null;

  openFile: (path: string) => void;
  openFileAt: (path: string, line: number) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  setPreviewUrl: (url: string | null) => void;
  setView: (view: WorkspaceView) => void;
  setSnapshots: (snapshots: FileSnapshot[]) => void;
  setPendingChatMessage: (msg: string | null) => void;
  clearPendingReveal: () => void;
  appendBrowserError: (error: BrowserError) => void;
  clearBrowserErrors: () => void;
  setIframeRuntimeReady: (ready: boolean) => void;
  setSelectedElement: (element: SelectedElement | null) => void;
  setPickModeActive: (active: boolean) => void;
  setIframeBridgeSend: (send: IframeBridgeSender | null) => void;
  reset: () => void;
}

const WORKSPACE_VIEW_STORAGE_KEY = "workspace:view";

function readPersistedView(): WorkspaceView {
  if (typeof window === "undefined") return "code";
  const view = window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY);
  return WORKSPACE_VIEWS.includes(view as WorkspaceView) ? (view as WorkspaceView) : "code";
}

function persistView(view: WorkspaceView) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, view);
}

const freshState = () => ({
  files: new Map<string, string>(),
  snapshotsLoaded: false,
  openTabs: [] as string[],
  activeTab: null as string | null,
  previewUrl: null as string | null,
  pendingChatMessage: null as string | null,
  view: readPersistedView(),
  pendingReveal: null as PendingReveal | null,
  browserErrors: [] as BrowserError[],
  iframeRuntimeReady: false,
  selectedElement: null as SelectedElement | null,
  pickModeActive: false,
  iframeBridgeSend: null as IframeBridgeSender | null,
});

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...freshState(),

  openFile: (path) =>
    set((s) => ({
      openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path],
      activeTab: path,
    })),

  openFileAt: (path, line) =>
    set((s) => ({
      openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path],
      activeTab: path,
      pendingReveal: { path, line },
    })),

  clearPendingReveal: () => set({ pendingReveal: null }),

  closeTab: (path) =>
    set((s) => {
      const next = s.openTabs.filter((p) => p !== path);
      const nextActive = s.activeTab === path ? (next.length > 0 ? next[next.length - 1] : null) : s.activeTab;
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

  setPreviewUrl: (url) => set({ previewUrl: url }),

  setView: (view) => {
    persistView(view);
    set({ view });
  },

  setSnapshots: (snapshots) => {
    const fileMap = new Map<string, string>();
    for (const s of snapshots) fileMap.set(s.path, s.content);
    set({ files: fileMap, snapshotsLoaded: true });
  },

  setPendingChatMessage: (msg) => set({ pendingChatMessage: msg }),

  appendBrowserError: (error) =>
    set((s) => {
      const next =
        s.browserErrors.length >= BROWSER_ERROR_BUFFER_LIMIT
          ? [...s.browserErrors.slice(1), error]
          : [...s.browserErrors, error];
      return { browserErrors: next };
    }),

  clearBrowserErrors: () => set({ browserErrors: [] }),

  setIframeRuntimeReady: (ready) => set({ iframeRuntimeReady: ready }),

  setSelectedElement: (element) => set({ selectedElement: element }),

  setPickModeActive: (active) => set({ pickModeActive: active }),

  setIframeBridgeSend: (send) => set({ iframeBridgeSend: send }),

  reset: () => set(freshState()),
}));
