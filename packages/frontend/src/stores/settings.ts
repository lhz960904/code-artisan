import { create } from "zustand";

export type SettingsSection = "general" | "system-prompt" | "mcp-servers";

export const DEFAULT_SETTINGS_SECTION: SettingsSection = "general";

interface SettingsStore {
  open: boolean;
  section: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  setSection: (section: SettingsSection) => void;
  close: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  open: false,
  section: DEFAULT_SETTINGS_SECTION,
  openSettings: (section) => set({ open: true, section: section ?? DEFAULT_SETTINGS_SECTION }),
  setSection: (section) => set({ section }),
  close: () => set({ open: false }),
}));
