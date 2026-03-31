import { useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useConversationStream } from "@/hooks/use-conversation-stream";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { useWorkspace } from "@/contexts/workspace-context";
import type { Message } from "@code-artisan/shared";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const { messages, streamingText, streamingThinking } = useConversationStream(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(new Set<string>());
  const { updateFile, openFile, appendTerminal, setPreviewUrl, loadSnapshots } =
    useWorkspace();

  // Load initial file snapshots
  useEffect(() => {
    loadSnapshots(conversationId);
  }, [conversationId, loadSnapshots]);

  // Auto-scroll to bottom
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
      processMessageSideEffects(msg, { updateFile, openFile, appendTerminal, setPreviewUrl });
    }
  }, [messages, updateFile, openFile, appendTerminal, setPreviewUrl]);

  const isAgentRunning =
    streamingText !== null ||
    streamingThinking !== null ||
    (messages.length > 0 &&
      messages[messages.length - 1].role === "assistant" &&
      messages[messages.length - 1].parts.some(
        (p) => p.type === "tool-call" && p.state === "call" && !p.approval,
      ));

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              conversationId={conversationId}
            />
          ))}

          {/* Streaming thinking */}
          {streamingThinking && (
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
                Thinking...
              </div>
              <div className="max-h-40 overflow-y-auto text-xs leading-relaxed text-muted-foreground/80 whitespace-pre-wrap">
                {streamingThinking}
              </div>
            </div>
          )}

          {/* Streaming text */}
          {streamingText && (
            <div className="text-sm leading-relaxed text-foreground">
              <MarkdownRenderer content={streamingText} />
            </div>
          )}

          {/* Working indicator */}
          {isAgentRunning && !streamingText && !streamingThinking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Working...
            </div>
          )}

        </div>
      </div>

      <ChatInput conversationId={conversationId} disabled={isAgentRunning} />
    </div>
  );
}

/** Extract workspace side effects from messages */
function processMessageSideEffects(
  msg: Message,
  ctx: {
    updateFile: (path: string, content: string) => void;
    openFile: (path: string) => void;
    appendTerminal: (entry: { command: string; output: string }) => void;
    setPreviewUrl: (url: string | null) => void;
  },
) {
  for (const part of msg.parts) {
    if (part.type === "tool-call" && part.state === "call") {
      if (part.toolName === "write_file") {
        const input = part.input as { path: string; content: string };
        if (input.path && input.content) {
          ctx.updateFile(input.path, input.content);
          ctx.openFile(input.path);
        }
      }
    }
    if (part.type === "tool-call" && part.state === "result") {
      if (part.toolName === "bash" && part.output) {
        ctx.appendTerminal({
          command: (part.input as { command: string }).command ?? "command",
          output: part.output,
        });
      }
      if (part.toolName === "read_file" && part.output) {
        const path = (part.input as { path: string }).path;
        if (path) {
          ctx.updateFile(path, part.output);
          ctx.openFile(path);
        }
      }
    }
  }
  if (msg.metadata?.previewUrl) {
    ctx.setPreviewUrl(msg.metadata.previewUrl as string);
  }
}
