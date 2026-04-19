import { create } from "zustand";
import type { Attachment } from "@code-artisan/shared";

export interface PendingPrompt {
  prompt: string;
  attachments: Attachment[];
}

interface PendingPromptStore {
  draft: PendingPrompt | null;
  byConversationId: Record<string, PendingPrompt>;

  setDraft: (data: PendingPrompt) => void;
  consumeDraft: () => PendingPrompt | null;

  setForConversation: (id: string, data: PendingPrompt) => void;
  consumeForConversation: (id: string) => PendingPrompt | null;
}

// Draft survives the GitHub OAuth full-page redirect via sessionStorage —
// attachments were uploaded the moment they were added, so only serialisable
// metadata (fileId, fileName, mimeType, size) needs to travel.
const DRAFT_KEY = "code-artisan.pendingPrompt.draft";

function readDraftFromStorage(): PendingPrompt | null {
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingPrompt;
  } catch {
    return null;
  }
}

function writeDraftToStorage(data: PendingPrompt | null) {
  if (data && (data.prompt || data.attachments.length > 0)) {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } else {
    sessionStorage.removeItem(DRAFT_KEY);
  }
}

export const usePendingPromptStore = create<PendingPromptStore>((set, get) => ({
  draft: null,
  byConversationId: {},

  setDraft: (data) => {
    writeDraftToStorage(data);
    set({ draft: data });
  },

  consumeDraft: () => {
    const memory = get().draft;
    const storage = memory ?? readDraftFromStorage();
    writeDraftToStorage(null);
    set({ draft: null });
    return storage;
  },

  setForConversation: (id, data) =>
    set((s) => ({ byConversationId: { ...s.byConversationId, [id]: data } })),

  consumeForConversation: (id) => {
    const data = get().byConversationId[id];
    if (!data) return null;
    set((s) => {
      const next = { ...s.byConversationId };
      delete next[id];
      return { byConversationId: next };
    });
    return data;
  },
}));
