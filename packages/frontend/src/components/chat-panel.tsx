import { useState, useRef, useEffect } from "react";
import { sendMessage } from "../lib/api";
import { useConversationStream, type StreamEvent } from "../lib/event-source";
import { ToolCallCard } from "./tool-call-card";
import { ConfirmCard } from "./confirm-card";
import { MarkdownRenderer } from "./markdown-renderer";
import { useWorkspace } from "../contexts/workspace-context";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const { events, streamingText } = useConversationStream(conversationId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedSeqRef = useRef(0);
  const { updateFile, openFile, appendTerminal, setPreviewUrl, loadSnapshots } = useWorkspace();

  // Load initial file snapshots
  useEffect(() => {
    loadSnapshots(conversationId);
  }, [conversationId, loadSnapshots]);

  // Auto-scroll to bottom on new events or streaming text
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, streamingText]);

  // Process events into workspace state
  useEffect(() => {
    for (const event of events) {
      const seq = event.seq ?? 0;
      if (seq <= processedSeqRef.current) continue;
      processedSeqRef.current = seq;

      const data = event.data as Record<string, unknown>;

      if (event.type === "tool_call") {
        const tool = data.tool as string;
        const args = data.args as Record<string, string>;

        if (tool === "write_file" && args.path && args.content) {
          updateFile(args.path, args.content);
          openFile(args.path);
        }
      }

      if (event.type === "tool_result") {
        const tool = data.tool as string;
        if (tool === "execute_command") {
          const callEvent = events.find(
            (e) => e.type === "tool_call" && (e.seq ?? 0) === seq - 1,
          );
          const command = callEvent
            ? ((callEvent.data as Record<string, unknown>).args as Record<string, string>)?.command ?? "command"
            : "command";

          appendTerminal({
            command,
            output: (data.output as string) ?? "",
            error: (data.error as string) || undefined,
          });
        }

        if (tool === "read_file") {
          const callEvent = events.find(
            (e) => e.type === "tool_call" && (e.seq ?? 0) === seq - 1,
          );
          const path = callEvent
            ? ((callEvent.data as Record<string, unknown>).args as Record<string, string>)?.path
            : null;

          if (path && data.output) {
            updateFile(path, data.output as string);
            openFile(path);
          }
        }
      }

      if (event.type === "preview_url") {
        setPreviewUrl(data.url as string);
      }
    }
  }, [events, updateFile, openFile, appendTerminal, setPreviewUrl]);

  // Check if agent is currently processing
  const isAgentRunning =
    streamingText !== null ||
    (events.length > 0 &&
      !["ai_text", "error", "done"].includes(events[events.length - 1].type) &&
      events.some((e) => e.type === "user_message"));

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

  function getToolResult(toolCallEvent: StreamEvent): StreamEvent | undefined {
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
                    <div className="text-sm leading-relaxed text-[#e6edf3]">
                      <MarkdownRenderer content={(event.data as { content: string }).content} />
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
              case "confirm_required": {
                const responseEvent = events.find(
                  (e) => e.type === "confirm_response" && (e.seq ?? 0) > (event.seq ?? 0),
                );
                return (
                  <ConfirmCard
                    key={event.id}
                    event={event}
                    conversationId={conversationId}
                    hasResponse={!!responseEvent}
                    wasApproved={responseEvent ? (responseEvent.data as { approved: boolean }).approved : undefined}
                  />
                );
              }
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
          {streamingText && (
            <div key="streaming" className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#58a6ff]">
                Agent
              </div>
              <div className="text-sm leading-relaxed text-[#e6edf3]">
                <MarkdownRenderer content={streamingText} />
              </div>
            </div>
          )}
          {isAgentRunning && !streamingText && (
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
