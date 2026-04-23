import { create } from "zustand";
import { DEFAULT_MODEL_ID, findModel } from "@code-artisan/shared";

const STORAGE_KEY = "code-artisan.modelPrefs";

interface ModelPrefsStore {
  model: string;
  setModel: (id: string) => void;
}

function readStoredModel(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { model?: string };
      if (parsed.model && findModel(parsed.model)) return parsed.model;
    }
  } catch {
    // ignored — SSR, private mode, corrupt value
  }
  return DEFAULT_MODEL_ID;
}

function writeStoredModel(model: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ model }));
  } catch {
    // ignored
  }
}

export const useModelPrefsStore = create<ModelPrefsStore>((set) => ({
  model: readStoredModel(),
  setModel: (id) => {
    set({ model: id });
    writeStoredModel(id);
  },
}));
