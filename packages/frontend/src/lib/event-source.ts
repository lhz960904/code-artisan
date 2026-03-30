import { useEffect, useRef, useState, useCallback } from "react";
import type { Message, MessagePart } from "@code-artisan/shared";

const API_BASE = "/api";

export function useConversationStream(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamingThinking, setStreamingThinking] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const fetchHistory = useCallback(async (convId: string) => {
    const res = await fetch(`${API_BASE}/conversations/${convId}/messages`);
    if (!res.ok) return;
    const data: Message[] = await res.json();
    setMessages(data);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    // 1. Load history
    fetchHistory(conversationId);

    // 2. Connect SSE for live updates
    const es = new EventSource(
      `${API_BASE}/conversations/${conversationId}/stream`,
    );
    esRef.current = es;

    const handleMessage = (e: MessageEvent) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(e.data);

        // Done signal
        if (data.type === "done") {
          setStreamingText(null);
          setStreamingThinking(null);
          return;
        }

        // Thinking delta (streaming, not persisted)
        if (data.type === "thinking-delta") {
          setStreamingThinking(data.thinkingDelta);
          return;
        }

        // Text delta (streaming, not persisted)
        if (data.type === "text-delta") {
          setStreamingText(data.textDelta);
          return;
        }

        // StreamEvent with part (persisted) — clears all streaming states
        if (data.messageId && data.part) {
          const streamEvent = data as { messageId: string; part: MessagePart };
          setStreamingText(null);
          setStreamingThinking(null);

          setMessages((prev) => {
            const existing = prev.find((m) => m.id === streamEvent.messageId);
            if (existing) {
              // Update existing message — add or update part
              return prev.map((m) => {
                if (m.id !== streamEvent.messageId) return m;
                // Check if this part already exists (tool-call state update)
                const existingPartIdx = m.parts.findIndex(
                  (p) =>
                    p.type === "tool-call" &&
                    streamEvent.part.type === "tool-call" &&
                    p.toolCallId === streamEvent.part.toolCallId,
                );
                if (existingPartIdx >= 0) {
                  const newParts = [...m.parts];
                  newParts[existingPartIdx] = streamEvent.part;
                  return { ...m, parts: newParts };
                }
                return { ...m, parts: [...m.parts, streamEvent.part] };
              });
            }
            // New message — create from first part
            return [
              ...prev,
              {
                id: streamEvent.messageId,
                role: inferRole(streamEvent.part),
                parts: [streamEvent.part],
                createdAt: new Date().toISOString(),
              } as Message,
            ];
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    // Listen to all SSE event types
    es.addEventListener("stream", handleMessage);
    es.addEventListener("text-delta", handleMessage);
    es.addEventListener("thinking-delta", handleMessage);
    es.addEventListener("done", handleMessage);

    // Also listen to generic message event as fallback
    es.onmessage = handleMessage;

    es.onerror = () => {
      if (!cancelled) {
        fetchHistory(conversationId);
      }
    };

    return () => {
      cancelled = true;
      es.close();
      esRef.current = null;
      setMessages([]);
      setStreamingText(null);
      setStreamingThinking(null);
      setReady(false);
    };
  }, [conversationId, fetchHistory]);

  return { messages, streamingText, streamingThinking, ready };
}

/** Infer message role from the first part */
function inferRole(part: MessagePart): Message["role"] {
  if (part.type === "tool-call" && part.state === "result") return "tool";
  if (
    part.type === "text" ||
    part.type === "thinking" ||
    part.type === "step-start" ||
    part.type === "step-end" ||
    part.type === "error"
  )
    return "assistant";
  if (part.type === "tool-call") return "assistant";
  return "user";
}
