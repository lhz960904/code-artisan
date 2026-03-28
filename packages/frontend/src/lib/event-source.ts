import { useEffect, useRef, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

export interface StreamEvent {
  id: string;
  conversation_id?: string;
  seq?: number;
  type: string;
  data: Record<string, unknown>;
}

export function useConversationStream(conversationId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const fetchHistory = useCallback(async (convId: string) => {
    const res = await fetch(`${API_BASE}/conversations/${convId}/events`);
    if (!res.ok) return;
    const data: StreamEvent[] = await res.json();
    setEvents(data);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    // 1. Load history from DB
    fetchHistory(conversationId);

    // 2. Connect SSE for live updates
    const es = new EventSource(
      `${API_BASE}/conversations/${conversationId}/stream`,
    );
    esRef.current = es;

    const handleEvent = (e: MessageEvent) => {
      if (cancelled) return;
      try {
        const event: {
          id: string;
          type: string;
          data: Record<string, unknown>;
          seq?: number;
        } = JSON.parse(e.data);

        if (event.type === "ai_text_delta") {
          setStreamingText((event.data as { content: string }).content);
          return;
        }

        // Persisted event — add to events list, clear streaming text
        setStreamingText(null);
        setEvents((prev) => {
          if (prev.some((ev) => ev.id === event.id)) {
            return prev.map((ev) =>
              ev.id === event.id ? { ...ev, ...event } : ev,
            );
          }
          return [...prev, event as StreamEvent];
        });
      } catch {
        // ignore parse errors
      }
    };

    const eventTypes = [
      "user_message",
      "ai_text",
      "ai_text_delta",
      "tool_call",
      "tool_result",
      "confirm_required",
      "confirm_response",
      "preview_url",
      "error",
      "done",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, handleEvent);
    }

    es.onerror = () => {
      // EventSource auto-reconnects; re-fetch history on reconnect
      if (!cancelled) {
        fetchHistory(conversationId);
      }
    };

    return () => {
      cancelled = true;
      es.close();
      esRef.current = null;
      setEvents([]);
      setStreamingText(null);
      setReady(false);
    };
  }, [conversationId, fetchHistory]);

  return { events, streamingText, ready };
}
