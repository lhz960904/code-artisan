import { create } from "zustand";

export type SettingsSection =
  | "general"
  | "system-prompt"
  | "personal-general"
  | "mcp-servers"
  | "integrations";

interface OpenSettingsOpts {
  conversationId?: string;
  section?: SettingsSection;
}

interface SettingsStore {
  open: boolean;
  conversationId: string | undefined;
  section: SettingsSection;
  openSettings: (opts?: OpenSettingsOpts) => void;
  setSection: (section: SettingsSection) => void;
  close: () => void;
}

function defaultSection(conversationId: string | undefined): SettingsSection {
  return conversationId ? "general" : "personal-general";
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  open: false,
  conversationId: undefined,
  section: "personal-general",
  openSettings: (opts) =>
    set({
      open: true,
      conversationId: opts?.conversationId,
      section: opts?.section ?? defaultSection(opts?.conversationId),
    }),
  setSection: (section) => set({ section }),
  close: () => set({ open: false }),
}));
