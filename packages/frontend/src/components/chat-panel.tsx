import { useState, useRef, useEffect } from "react";
import { sendMessage } from "../lib/api";
import { useConversationStream } from "../lib/event-source";
import { ToolCallCard } from "./tool-call-card";
import { MarkdownRenderer } from "./markdown-renderer";
import { useWorkspace } from "../contexts/workspace-context";
import type { Message, MessagePart, ToolCallPart } from "@code-artisan/shared";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const { messages, streamingText, streamingThinking } = useConversationStream(conversationId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(new Set<string>());
  const { updateFile, openFile, appendTerminal, setPreviewUrl, loadSnapshots } =
    useWorkspace();

  // Load initial file snapshots
  useEffect(() => {
    loadSnapshots(conversationId);
  }, [conversationId, loadSnapshots]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, streamingThinking]);

  // Process messages into workspace state (side effects)
  useEffect(() => {
    for (const msg of messages) {
      if (processedRef.current.has(msg.id)) continue;
      processedRef.current.add(msg.id);

      for (const part of msg.parts) {
        if (part.type === "tool-call" && part.state === "call") {
          if (part.toolName === "write_file") {
            const input = part.input as { path: string; content: string };
            if (input.path && input.content) {
              updateFile(input.path, input.content);
              openFile(input.path);
            }
          }
        }

        if (part.type === "tool-call" && part.state === "result") {
          if (part.toolName === "bash" && part.output) {
            appendTerminal({
              command: (part.input as { command: string }).command ?? "command",
              output: part.output,
            });
          }
          if (part.toolName === "read_file" && part.output) {
            const path = (part.input as { path: string }).path;
            if (path) {
              updateFile(path, part.output);
              openFile(path);
            }
          }
        }
      }

      // Check metadata for preview URL
      if (msg.metadata?.previewUrl) {
        setPreviewUrl(msg.metadata.previewUrl as string);
      }
    }
  }, [messages, updateFile, openFile, appendTerminal, setPreviewUrl]);

  // Check if agent is running
  const isAgentRunning =
    streamingText !== null ||
    streamingThinking !== null ||
    (messages.length > 0 &&
      messages[messages.length - 1].role === "assistant" &&
      messages[messages.length - 1].parts.some(
        (p) => p.type === "tool-call" && p.state === "call" && !p.approval,
      ));

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

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {messages.map((msg) => (
            <MessageRenderer
              key={msg.id}
              message={msg}
              conversationId={conversationId}
            />
          ))}
          {streamingThinking && (
            <div key="streaming-thinking" className="rounded-md border border-[#8b949e]/20 bg-[#161b22] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#8b949e]">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#8b949e]" />
                Thinking...
              </div>
              <div className="max-h-40 overflow-y-auto text-xs leading-relaxed text-[#8b949e]/80 whitespace-pre-wrap">
                {streamingThinking}
              </div>
            </div>
          )}
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

// --- Message Renderer ---

function MessageRenderer({
  message,
  conversationId,
}: {
  message: Message;
  conversationId: string;
}) {
  if (message.metadata?.compacted) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-[#30363d]" />
        <span className="text-xs text-[#8b949e]">Conversation compacted</span>
        <div className="h-px flex-1 bg-[#30363d]" />
      </div>
    );
  }

  return (
    <>
      {message.parts.map((part, i) => (
        <PartRenderer
          key={`${message.id}-${i}`}
          part={part}
          message={message}
          conversationId={conversationId}
        />
      ))}
    </>
  );
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-[#8b949e]/20 bg-[#161b22]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 p-3 text-xs font-medium text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
      >
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Thinking
        <span className="text-[#8b949e]/50">({thinking.length} chars)</span>
      </button>
      {open && (
        <div className="border-t border-[#8b949e]/10 p-3 max-h-60 overflow-y-auto text-xs leading-relaxed text-[#8b949e]/80 whitespace-pre-wrap">
          {thinking}
        </div>
      )}
    </div>
  );
}

function PartRenderer({
  part,
  message,
  conversationId,
}: {
  part: MessagePart;
  message: Message;
  conversationId: string;
}) {
  switch (part.type) {
    case "text":
      if (message.role === "user" && !message.metadata?.confirmResponse) {
        return (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
              You
            </div>
            <div className="text-sm leading-relaxed text-[#e6edf3]">
              {part.text}
            </div>
          </div>
        );
      }
      if (message.role === "assistant") {
        return (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#58a6ff]">
              Agent
            </div>
            <div className="text-sm leading-relaxed text-[#e6edf3]">
              <MarkdownRenderer content={part.text} />
            </div>
          </div>
        );
      }
      return null;

    case "tool-call":
      return (
        <ToolCallCard
          part={part as ToolCallPart}
          conversationId={conversationId}
        />
      );

    case "error":
      return (
        <div className="rounded-md border border-[#f85149]/30 bg-[#f85149]/10 p-3 text-sm text-[#f85149]">
          Error: {part.message}
        </div>
      );

    case "thinking":
      return <ThinkingBlock thinking={part.thinking} />;

    // step-start, step-end, image, document — skip rendering for now
    default:
      return null;
  }
}
