import { useEffect, useRef, useState, useCallback } from "react";
import type { Message, MessagePart, StreamData } from "@code-artisan/shared";

// ============================================================
// Types
// ============================================================

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export interface UseChatOptions {
  /** Initial messages (loaded externally) */
  initialMessages?: Message[];
  /** SSE stream URL for this conversation */
  streamUrl: string;
  /** Send a user message to start agent */
  sendMessage: (conversationId: string, content: string) => Promise<unknown>;
  /** Fetch messages from DB (for catch-up after SSE done/error) */
  fetchMessages: (conversationId: string) => Promise<Message[]>;
  /** Callback when SSE is finished */
  onFinish?: () => void;
  /** Callback when SSE is errored */
  onError?: (error: Error) => void;
}

export interface UseChatReturn {
  messages: Message[];
  status: ChatStatus;
  sendMessage: (content: string) => void;
  stop: () => void;
  error: Error | null;
}

// ============================================================
// Hook
// ============================================================

export function useChat(conversationId: string | null, options: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>(options.initialMessages ?? []);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<Error | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const sendInFlightRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Sync when initialMessages loaded/changed externally (e.g. TanStack Query resolves)
  useEffect(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      setMessages((prev) => {
        // Don't overwrite if we have optimistic or SSE-delivered messages
        if (prev.some((m) => m.id.startsWith("opt-") || m.id.startsWith("stream_"))) return prev;
        // Don't overwrite if we already have more messages (from SSE)
        if (prev.length > options.initialMessages!.length) return prev;
        return options.initialMessages!;
      });
    }
  }, [options.initialMessages]);

  // -- Refetch from DB to ensure consistency --
  const refetchMessages = useCallback(() => {
    if (!conversationId) return;
    optionsRef.current.fetchMessages(conversationId).then(setMessages).catch(() => {});
  }, [conversationId]);

  // -- SSE event handler --
  const createSSEHandler = useCallback(
    () => (e: MessageEvent) => {
      if (!e.data) return; // heartbeat ping (empty data)
      try {
        const event = JSON.parse(e.data) as StreamData;

        switch (event.type) {
          case 'stream-finish': {
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

          case 'part': {
            const { messageId, role, part } = event;
            setMessages((prev) => upsertMessage(prev, messageId, role ?? "assistant",
              (parts) => updateMessagePart({ id: messageId, role: role ?? "assistant", parts, createdAt: "" } as Message, part).parts
            ));
            break;
          }

          case 'error': {
            const err = new Error(event.error);
            setStatus("error");
            setError(err);
            sendInFlightRef.current = false;
            optionsRef.current.onError?.(err);
            break;
          }

          // ── 三段式文本 ──────────────────────────────
          case 'text-start': {
            setStatus("streaming");
            setMessages((prev) => upsertMessage(prev, event.messageId, "assistant",
              (parts) => [...parts, { type: "text" as const, text: "", status: "streaming" as const }]
            ));
            break;
          }
          case 'text-delta': {
            const { messageId, delta } = event;
            setMessages((prev) => prev.map((m) => {
              if (m.id !== messageId) return m;
              const parts = [...m.parts];
              const idx = parts.findLastIndex((p) => p.type === "text" && "status" in p && p.status === "streaming");
              if (idx < 0) return m;
              const cur = parts[idx] as { type: "text"; text: string; status: string };
              parts[idx] = { ...cur, text: cur.text + delta };
              return { ...m, parts };
            }));
            break;
          }
          case 'text-end': {
            const { messageId } = event;
            setMessages((prev) => prev.map((m) => {
              if (m.id !== messageId) return m;
              return { ...m, parts: m.parts.map((p) =>
                p.type === "text" && "status" in p && p.status === "streaming"
                  ? { ...p, status: "done" as const } : p
              )};
            }));
            break;
          }

          // ── 三段式思考链 ─────────────────────────────
          case 'reasoning-start': {
            setStatus("streaming");
            setMessages((prev) => upsertMessage(prev, event.messageId, "assistant",
              (parts) => [...parts, { type: "thinking" as const, thinking: "", status: "streaming" as const }]
            ));
            break;
          }
          case 'reasoning-delta': {
            const { messageId, delta } = event;
            setMessages((prev) => prev.map((m) => {
              if (m.id !== messageId) return m;
              const parts = [...m.parts];
              const idx = parts.findLastIndex((p) => p.type === "thinking" && "status" in p && p.status === "streaming");
              if (idx < 0) return m;
              const cur = parts[idx] as { type: "thinking"; thinking: string; status: string };
              parts[idx] = { ...cur, thinking: cur.thinking + delta };
              return { ...m, parts };
            }));
            break;
          }
          case 'reasoning-end': {
            const { messageId } = event;
            setMessages((prev) => prev.map((m) => {
              if (m.id !== messageId) return m;
              return { ...m, parts: m.parts.map((p) =>
                p.type === "thinking" && "status" in p && p.status === "streaming"
                  ? { ...p, status: "done" as const } : p
              )};
            }));
            break;
          }

          // ── Tool 参数流式 ─────────────────────────────
          case 'tool-input-start': {
            const { messageId, toolCallId, toolName } = event;
            setMessages((prev) => upsertMessage(prev, messageId, "assistant",
              (parts) => [...parts, {
                type: "tool-call" as const, toolCallId, toolName,
                input: {} as Record<string, unknown>, state: "partial-call" as const,
              }]
            ));
            break;
          }
          case 'tool-input-delta':
            // delta accumulation is handled display-side; input is finalized at tool-input-end
            break;
          case 'tool-input-end': {
            const { messageId, toolCallId, input } = event;
            setMessages((prev) => prev.map((m) => {
              if (m.id !== messageId) return m;
              return { ...m, parts: m.parts.map((p) =>
                p.type === "tool-call" && p.toolCallId === toolCallId
                  ? { ...p, input: input as Record<string, unknown>, state: "call" as const }
                  : p
              )};
            }));
            break;
          }

          case 'step-start':
          case 'step-finish':
          case 'abort':
          case 'ping':
            break;
        }
      } catch {
        // ignore parse errors
      }
    },
    [refetchMessages],
  );

  // -- Connect SSE --
  const connectSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(optionsRef.current.streamUrl);
    esRef.current = es;
    es.onmessage = createSSEHandler();

    es.onerror = () => {
      es.close();
      esRef.current = null;
      refetchMessages();
    };
  }, [createSSEHandler, refetchMessages]);

  // -- On mount: connect SSE (server returns done immediately if agent not running) --
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

  // -- Send message --
  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversationId || sendInFlightRef.current) return;
      sendInFlightRef.current = true;

      setMessages((prev) => [
        ...prev,
        {
          id: `opt-${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: content }],
          createdAt: new Date().toISOString(),
        } as Message,
      ]);
      setStatus("submitted");
      setError(null);

      try {
        // POST first — sets agentRunning=true on server
        await optionsRef.current.sendMessage(conversationId, content);
        // Then connect SSE — server sees agentRunning=true, keeps connection open
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

  // -- Stop --
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

// ============================================================
// Helpers
// ============================================================

/**
 * Update or append a non-streaming part within a message.
 * Streaming text/thinking are handled via three-phase events (text-start/delta/end etc.)
 * so this only handles: tool-call state updates, user text parts, error parts, step-end parts.
 */
function updateMessagePart(msg: Message, part: MessagePart): Message {
  const parts = [...msg.parts];

  if (part.type === "tool-call") {
    const idx = parts.findIndex(
      (p) => p.type === "tool-call" && p.toolCallId === part.toolCallId,
    );
    if (idx >= 0) {
      parts[idx] = part;
      return { ...msg, parts };
    }
  }

  return { ...msg, parts: [...parts, part] };
}

/**
 * Ensure a message with the given ID exists in the list, then apply `update` to its parts.
 * Strips optimistic messages on first real event.
 */
function upsertMessage(
  prev: Message[],
  messageId: string,
  role: Message["role"],
  update: (parts: MessagePart[]) => MessagePart[],
): Message[] {
  const base = prev.filter((m) => !m.id.startsWith("opt-"));
  const existing = base.find((m) => m.id === messageId);
  if (existing) {
    return base.map((m) => m.id !== messageId ? m : { ...m, parts: update(m.parts) });
  }
  return [...base, { id: messageId, role, parts: update([]), createdAt: new Date().toISOString() } as Message];
}

