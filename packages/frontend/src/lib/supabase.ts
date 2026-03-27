import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

const supabaseUrl = import.meta.env.SUPABASE_URL as string;
const supabaseKey = import.meta.env.SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface RealtimeEvent {
  id: string;
  conversation_id: string;
  seq: number;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
}

export function useConversationEvents(conversationId: string | null) {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [ready, setReady] = useState(false);
  const lastSeqRef = useRef(0);

  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;
    lastSeqRef.current = 0;

    // Fetch existing events
    supabase
      .from("events")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("seq", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        if (data && data.length > 0) {
          setEvents(data);
          lastSeqRef.current = data[data.length - 1].seq;
        } else {
          setEvents([]);
        }
        setReady(true);
      });

    // Subscribe to new events via Realtime
    const channel = supabase
      .channel(`events:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newEvent = payload.new as RealtimeEvent;
          setEvents((prev) => {
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            return [...prev, newEvent];
          });
          lastSeqRef.current = Math.max(lastSeqRef.current, newEvent.seq);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      setReady(false);
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { events, ready };
}
