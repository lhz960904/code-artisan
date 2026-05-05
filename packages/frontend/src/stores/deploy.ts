import { create } from "zustand";
import type {
  Deployment,
  DeployErrorCode,
  DeployEvent,
  DeploymentStatus,
} from "@code-artisan/shared";
import { API_BASE } from "@/api/client";

export type DeployUiState = "idle" | "running" | "success" | "failed";

export interface ConversationDeployState {
  state: DeployUiState;
  status: DeploymentStatus | null;
  message: string | null;
  deployment: Deployment | null;
  error: { code: DeployErrorCode; message: string } | null;
}

const empty: ConversationDeployState = {
  state: "idle",
  status: null,
  message: null,
  deployment: null,
  error: null,
};

interface DeployStore {
  byConversation: Record<string, ConversationDeployState>;
  start: (conversationId: string, onDone?: () => void) => Promise<void>;
  reset: (conversationId: string) => void;
}

export const useDeployStore = create<DeployStore>((set, get) => ({
  byConversation: {},

  reset: (conversationId) =>
    set((s) => ({ byConversation: { ...s.byConversation, [conversationId]: empty } })),

  start: async (conversationId, onDone) => {
    if (get().byConversation[conversationId]?.state === "running") return;

    const update = (patch: Partial<ConversationDeployState>) => {
      set((s) => ({
        byConversation: {
          ...s.byConversation,
          [conversationId]: { ...(s.byConversation[conversationId] ?? empty), ...patch },
        },
      }));
    };

    update({ state: "running", status: "pending", message: "Starting…", error: null, deployment: null });

    try {
      const resp = await fetch(`${API_BASE}/deployment/${conversationId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop()!;
        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            try {
              const event = JSON.parse(data) as DeployEvent;
              switch (event.type) {
                case "status":
                  update({ status: event.status, message: event.message });
                  break;
                case "log":
                  update({ message: event.message });
                  break;
                case "done":
                  update({
                    state: "success",
                    status: "live",
                    deployment: event.deployment,
                    message: "Live",
                  });
                  onDone?.();
                  break;
                case "error":
                  update({
                    state: "failed",
                    error: { code: event.code, message: event.message },
                    deployment: event.deployment ?? null,
                  });
                  onDone?.();
                  break;
              }
            } catch {
              // ignore unparseable frames (e.g. heartbeat)
            }
          }
        }
      }

      const final = get().byConversation[conversationId];
      if (final?.state === "running") {
        update({ state: "failed", error: { code: "generic", message: "Stream ended unexpectedly" } });
      }
    } catch (err) {
      update({
        state: "failed",
        error: { code: "generic", message: err instanceof Error ? err.message : String(err) },
      });
      onDone?.();
    }
  },
}));

export function useConversationDeploy(conversationId: string) {
  const state = useDeployStore((s) => s.byConversation[conversationId] ?? empty);
  const start = useDeployStore((s) => s.start);
  const reset = useDeployStore((s) => s.reset);
  return {
    ...state,
    start: (onDone?: () => void) => start(conversationId, onDone),
    reset: () => reset(conversationId),
  };
}
