import { useState, useRef, useEffect } from "react";
import { sendMessage } from "../lib/api";
import { useConversationEvents, type RealtimeEvent } from "../lib/supabase";
import { ToolCallCard } from "./tool-call-card";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const { events } = useConversationEvents(conversationId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Check if agent is currently processing
  const isAgentRunning =
    events.length > 0 &&
    !["ai_text", "error"].includes(events[events.length - 1].type) &&
    events.some((e) => e.type === "user_message");

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);

    try {
      await sendMessage(conversationId, content);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }

  // Pair tool_call events with their tool_result
  function getToolResult(toolCallEvent: RealtimeEvent): RealtimeEvent | undefined {
    const idx = events.indexOf(toolCallEvent);
    for (let i = idx + 1; i < events.length; i++) {
      if (events[i].type === "tool_result") return events[i];
      if (events[i].type === "tool_call") break;
    }
    return undefined;
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {events.map((event) => {
            switch (event.type) {
              case "user_message":
                return (
                  <div key={event.id} className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
                      You
                    </div>
                    <div className="text-sm leading-relaxed text-[#e6edf3]">
                      {(event.data as { content: string }).content}
                    </div>
                  </div>
                );
              case "ai_text":
                return (
                  <div key={event.id} className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#58a6ff]">
                      Agent
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#e6edf3]">
                      {(event.data as { content: string }).content}
                    </div>
                  </div>
                );
              case "tool_call":
                return (
                  <ToolCallCard
                    key={event.id}
                    event={event}
                    result={getToolResult(event)}
                  />
                );
              case "error":
                return (
                  <div
                    key={event.id}
                    className="rounded-md border border-[#f85149]/30 bg-[#f85149]/10 p-3 text-sm text-[#f85149]"
                  >
                    Error: {(event.data as { content: string }).content}
                  </div>
                );
              default:
                return null;
            }
          })}
          {isAgentRunning && (
            <div className="animate-pulse text-sm text-[#8b949e]">
              Agent is working...
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-[#30363d] p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your task..."
            disabled={isAgentRunning}
            className="flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#484f58] outline-none focus:border-[#58a6ff] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || isAgentRunning || !input.trim()}
            className="rounded-md bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
