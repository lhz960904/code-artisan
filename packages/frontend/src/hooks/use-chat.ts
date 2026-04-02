import { useEffect, useRef, useState, useCallback } from "react";
import type { Message, MessagePart, MessageStreamEvent, TextPart, ThinkingPart, ToolCallPart } from "@code-artisan/shared";

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

  // eslint-disable-next-line react-hooks/purity
  const streamMsgIdRef = useRef(`stream_${Date.now()}`);

  // Sync when initialMessages loaded/changed externally (e.g. TanStack Query resolves)
  useEffect(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      setMessages((prev) => {
        if (prev.some((m) => m.id.startsWith("opt-") || m.id.startsWith("stream_"))) return prev;
        if (prev.length > options.initialMessages!.length) return prev;
        return options.initialMessages!;
      });
    }
  }, [options.initialMessages]);

  // -- Refetch from DB to ensure consistency --
  const refetchMessages = useCallback(() => {
    if (!conversationId) return;
    optionsRef.current
      .fetchMessages(conversationId)
      .then(setMessages)
      .catch(() => {});
  }, [conversationId]);

  // -- SSE event handler --
  const createSSEHandler = useCallback(
    () => (e: MessageEvent) => {
      if (!e.data) return;
      try {
        const event = JSON.parse(e.data) as MessageStreamEvent;

        switch (event.type) {
          case "stream-finish": {
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

          case "tool-output": {
            setMessages((prev) =>
              updateToolCallPart(prev, event.toolCallId, (part) => ({
                ...part,
                state: event.state,
                output: event.output,
              })),
            );
            break;
          }

          case "tool-approval": {
            setMessages((prev) =>
              updateToolCallPart(prev, event.toolCallId, (part) => ({
                ...part,
                approval: event.approval,
              })),
            );
            break;
          }

          case "error": {
            const err = new Error(event.error);
            setStatus("error");
            setError(err);
            sendInFlightRef.current = false;
            optionsRef.current.onError?.(err);
            break;
          }

          // ── step lifecycle ──────────────────────────────
          case "step-start": {
            streamMsgIdRef.current = `stream_${Date.now()}`;
            break;
          }

          // ── 三段式文本 ──────────────────────────────
          case "text-start": {
            setStatus("streaming");
            const msgId = streamMsgIdRef.current;
            setMessages((prev) => upsertMessage(prev, msgId, "assistant", (parts) => [...parts, { type: "text", text: "", status: "streaming" }]));
            break;
          }
          case "text-delta": {
            const msgId = streamMsgIdRef.current;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== msgId) return m;
                const parts = [...m.parts];
                const idx = parts.findLastIndex((p) => p.type === "text" && p.status === "streaming");
                if (idx < 0) return m;
                const cur = parts[idx] as TextPart;
                parts[idx] = { ...cur, text: cur.text + event.delta };
                return { ...m, parts };
              }),
            );
            break;
          }
          case "text-end": {
            const msgId = streamMsgIdRef.current;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== msgId) return m;
                return { ...m, parts: m.parts.map((p) => (p.type === "text" && p.status === "streaming" ? { ...p, status: "done" } : p)) };
              }),
            );
            break;
          }

          // ── 三段式思考链 ─────────────────────────────
          case "thinking-start": {
            setStatus("streaming");
            const msgId = streamMsgIdRef.current;
            setMessages((prev) =>
              upsertMessage(prev, msgId, "assistant", (parts) => [...parts, { type: "thinking", thinking: "", status: "streaming" }]),
            );
            break;
          }
          case "thinking-delta": {
            const msgId = streamMsgIdRef.current;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== msgId) return m;
                const parts = [...m.parts];
                const idx = parts.findLastIndex((p) => p.type === "thinking" && p.status === "streaming");
                if (idx < 0) return m;
                const cur = parts[idx] as ThinkingPart;
                parts[idx] = { ...cur, thinking: cur.thinking + event.delta };
                return { ...m, parts };
              }),
            );
            break;
          }
          case "thinking-end": {
            const msgId = streamMsgIdRef.current;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== msgId) return m;
                return {
                  ...m,
                  parts: m.parts.map((p) =>
                    p.type === "thinking" && p.status === "streaming" ? { ...p, signature: event.signature, status: "done" } : p,
                  ),
                };
              }),
            );
            break;
          }

          // ── Tool 参数流式 ─────────────────────────────
          case "tool-input-start": {
            const msgId = streamMsgIdRef.current;
            setMessages((prev) =>
              upsertMessage(prev, msgId, "assistant", (parts) => [
                ...parts,
                {
                  type: "tool-call",
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  input: {} as Record<string, unknown>,
                  state: "partial-call",
                },
              ]),
            );
            break;
          }
          case "tool-input-delta":
            break;
          case "tool-input-end": {
            const msgId = streamMsgIdRef.current;
            let parsedInput: Record<string, unknown> = {};
            try { parsedInput = JSON.parse(event.text || "{}"); } catch { /* ignore */ }
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== msgId) return m;
                return {
                  ...m,
                  parts: m.parts.map((p) =>
                    p.type === "tool-call" && p.toolCallId === event.toolCallId
                      ? { ...p, state: "call", input: parsedInput }
                      : p,
                  ),
                };
              }),
            );
            break;
          }

          case "step-finish":
          case "abort":
          case "ping":
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
        await optionsRef.current.sendMessage(conversationId, content);
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
 * Ensure a message with the given ID exists in the list, then apply `update` to its parts.
 * Strips optimistic messages on first real event.
 */
/**
 * Ensure a message with the given ID exists in the list, then apply `update` to its parts.
 * Optimistic messages are kept until refetchMessages replaces the full list.
 */
function upsertMessage(prev: Message[], messageId: string, role: Message["role"], update: (parts: MessagePart[]) => MessagePart[]): Message[] {
  const existing = prev.find((m) => m.id === messageId);
  if (existing) {
    return prev.map((m) => (m.id !== messageId ? m : { ...m, parts: update(m.parts) }));
  }
  return [...prev, { id: messageId, role, parts: update([]), createdAt: new Date().toISOString() } as Message];
}

/** Find a ToolCallPart by toolCallId across all messages and apply an updater */
function updateToolCallPart(messages: Message[], toolCallId: string, updater: (part: ToolCallPart) => ToolCallPart): Message[] {
  return messages.map((m) => {
    const idx = m.parts.findIndex((p) => p.type === "tool-call" && p.toolCallId === toolCallId);
    if (idx < 0) return m;
    const newParts = [...m.parts];
    newParts[idx] = updater(newParts[idx] as ToolCallPart);
    return { ...m, parts: newParts };
  });
}
