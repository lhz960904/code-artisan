import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ConversationWsClient,
  type ConversationWsListener,
  type SessionMeta,
} from "@/lib/conversation-ws";
import { useWorkspaceStore } from "@/stores/workspace";

export type DisplaySession = Omit<SessionMeta, "status"> & { status: SessionMeta["status"] | "pending" };

interface ConversationWsContextValue {
  client: ConversationWsClient | null;
  sessions: DisplaySession[];
  setSessions: React.Dispatch<React.SetStateAction<DisplaySession[]>>;
  subscribe: (listener: ConversationWsListener) => () => void;
}

const ConversationWsContext = createContext<ConversationWsContextValue | null>(null);

interface ConversationWsProviderProps {
  conversationId: string;
  children: ReactNode;
}

export function ConversationWsProvider({ conversationId, children }: ConversationWsProviderProps) {
  const [client, setClient] = useState<ConversationWsClient | null>(null);
  const [sessions, setSessions] = useState<DisplaySession[]>([]);

  useEffect(() => {
    const c = new ConversationWsClient(conversationId);
    setClient(c);
    const unsub = c.subscribe((event) => {
      switch (event.op) {
        case "sessions":
          setSessions((prev) => {
            // Preserve any local drafts — server has no record of them yet.
            const drafts = prev.filter((s) => s.status === "pending");
            return [...event.sessions, ...drafts];
          });
          break;
        case "session_started":
          setSessions((prev) => (prev.some((s) => s.id === event.meta.id) ? prev : [...prev, event.meta]));
          break;
        case "session_ended":
          setSessions((prev) => prev.filter((s) => s.id !== event.sessionId));
          break;
        case "preview_updated":
          useWorkspaceStore.getState().setPreviewUrl(event.url);
          break;
        case "created": {
          const { draftId, meta } = event;
          setSessions((prev) => {
            const cleaned = prev.filter((s) => s.id !== draftId && s.id !== meta.id);
            return [...cleaned, meta];
          });
          break;
        }
        case "create_failed":
          if (event.draftId) setSessions((prev) => prev.filter((s) => s.id !== event.draftId));
          console.warn("[conversation-ws] create failed:", event.message);
          break;
        case "error":
          console.warn("[conversation-ws]", event.message, event.cause);
          break;
      }
    });
    return () => {
      unsub();
      c.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = useCallback<ConversationWsContextValue["subscribe"]>(
    (listener) => client?.subscribe(listener) ?? (() => undefined),
    [client],
  );

  return (
    <ConversationWsContext.Provider value={{ client, sessions, setSessions, subscribe }}>
      {children}
    </ConversationWsContext.Provider>
  );
}

export function useConversationWs(): ConversationWsContextValue {
  const ctx = useContext(ConversationWsContext);
  if (!ctx) throw new Error("useConversationWs must be used inside <ConversationWsProvider>");
  return ctx;
}
