import { useEffect, useRef, useState, useCallback } from "react";
import type {
  StoredMessage,
  AgentSseEvent,
  Attachment,
} from "@code-artisan/shared";

// ============================================================
// Types
// ============================================================

export type ChatStatus = "ready" | "submitted" | "running" | "error";

export interface UseChatOptions {
  /** Initial messages (loaded externally). */
  initialMessages?: StoredMessage[];
  /** SSE stream URL for this conversation. */
  streamUrl: string;
  /** Call the backend API to start a run. */
  sendMessage: (
    conversationId: string,
    content: string,
    attachments?: Attachment[],
  ) => Promise<unknown>;
  /** Refetch persisted messages after the stream settles. */
  fetchMessages: (conversationId: string) => Promise<StoredMessage[]>;
  onFinish?: () => void;
  onError?: (error: Error) => void;
  /** Called when the agent emits a file-change event. */
  onFileChange?: (files: Array<{ path: string; content: string }>) => void;
}

export interface UseChatReturn {
  messages: StoredMessage[];
  status: ChatStatus;
  sendMessage: (content: string, attachments?: Attachment[]) => void;
  stop: () => void;
  error: Error | null;
}

// ============================================================
// Hook
// ============================================================

export function useChat(
  conversationId: string | null,
  options: UseChatOptions,
): UseChatReturn {
  const [messages, setMessages] = useState<StoredMessage[]>(
    options.initialMessages ?? [],
  );
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<Error | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const sendInFlightRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Sync when initialMessages arrive late (TanStack Query resolves).
  useEffect(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      setMessages((prev) => {
        if (prev.some((m) => m.id.startsWith("opt-"))) return prev;
        if (prev.length > options.initialMessages!.length) return prev;
        return options.initialMessages!;
      });
    }
  }, [options.initialMessages]);

  const refetchMessages = useCallback(() => {
    if (!conversationId) return;
    optionsRef.current
      .fetchMessages(conversationId)
      .then(setMessages)
      .catch(() => {});
  }, [conversationId]);

  const handleSseEvent = useCallback(
    (event: AgentSseEvent) => {
      switch (event.type) {
        case "message": {
          setStatus("running");
          setMessages((prev) => {
            // If this message is already there (e.g. from an optimistic
            // insert with matching id), replace; otherwise drop any
            // optimistic ones and append.
            const filtered = prev.filter((m) => !m.id.startsWith("opt-"));
            if (filtered.some((m) => m.id === event.message.id)) {
              return filtered.map((m) =>
                m.id === event.message.id ? event.message : m,
              );
            }
            return [...filtered, event.message];
          });
          break;
        }
        case "file": {
          optionsRef.current.onFileChange?.(event.files);
          break;
        }
        case "done": {
          setStatus("ready");
          sendInFlightRef.current = false;
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
          refetchMessages();
          optionsRef.current.onFinish?.();
          break;
        }
        case "error": {
          const err = new Error(event.error);
          setStatus("error");
          setError(err);
          sendInFlightRef.current = false;
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
          optionsRef.current.onError?.(err);
          break;
        }
      }
    },
    [refetchMessages],
  );

  const connectSSE = useCallback(() => {
    if (!conversationId) return;
    if (esRef.current) esRef.current.close();

    const es = new EventSource(optionsRef.current.streamUrl);
    esRef.current = es;

    es.onmessage = (e) => {
      if (!e.data) return;
      try {
        const parsed = JSON.parse(e.data) as AgentSseEvent;
        handleSseEvent(parsed);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      refetchMessages();
    };
  }, [conversationId, handleSseEvent, refetchMessages]);

  useEffect(() => {
    if (!conversationId) return;
    connectSSE();
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setStatus("ready");
      setError(null);
      sendInFlightRef.current = false;
    };
  }, [conversationId, connectSSE]);

  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!conversationId || sendInFlightRef.current) return;
      sendInFlightRef.current = true;

      // Optimistic user message — replaced once the server assigns an id
      // and sends it back through the SSE stream.
      const optId = `opt-${Date.now()}`;
      const optContent: StoredMessage["content"] = [];
      if (attachments) {
        for (const att of attachments) {
          if (att.mimeType.startsWith("image/")) {
            optContent.push({
              type: "image_url",
              image_url: { url: `files/${att.fileId}` },
            });
          } else {
            optContent.push({ type: "text", text: `[File: ${att.fileName}]` });
          }
        }
      }
      if (content) optContent.push({ type: "text", text: content });

      setMessages((prev) => [
        ...prev,
        {
          id: optId,
          conversationId,
          role: "user",
          content: optContent as StoredMessage["content"],
          createdAt: new Date().toISOString(),
        } as StoredMessage,
      ]);
      setStatus("submitted");
      setError(null);

      try {
        await optionsRef.current.sendMessage(conversationId, content, attachments);
        connectSSE();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setStatus("error");
        setError(error);
        sendInFlightRef.current = false;
        optionsRef.current.onError?.(error);
      }
    },
    [conversationId, connectSSE],
  );

  const stop = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setStatus("ready");
    sendInFlightRef.current = false;
  }, []);

  return { messages, status, sendMessage, stop, error };
}
