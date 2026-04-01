import { useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { useWorkspace } from "@/contexts/workspace-context";
import { useMessages, useSendMessage, fetchMessages } from "@/lib/apis";
import { API_BASE } from "@/lib/apis/client";
import type { Message } from "@code-artisan/shared";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const { data: initialMessages } = useMessages(conversationId);
  const sendMsgApi = useSendMessage();

  const { messages, status, sendMessage } =
    useChat(conversationId, {
      initialMessages,
      streamUrl: `${API_BASE}/conversations/${conversationId}/stream`,
      sendMessage: (id, content) => sendMsgApi.mutateAsync({ conversationId: id, content }),
      fetchMessages,
    });
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(new Set<string>());
  const { updateFile, openFile, appendTerminal, setPreviewUrl, loadSnapshots } =
    useWorkspace();

  useEffect(() => {
    loadSnapshots(conversationId);
  }, [conversationId, loadSnapshots]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.id.startsWith("opt-")) continue;
      if (processedRef.current.has(msg.id)) continue;
      processedRef.current.add(msg.id);
      processMessageSideEffects(msg, { updateFile, openFile, appendTerminal, setPreviewUrl });
    }
  }, [messages, updateFile, openFile, appendTerminal, setPreviewUrl]);

  const isBusy = status !== "ready" && status !== "error";

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

          {isBusy && !messages.some((m) => m.parts.some((p) => "status" in p && p.status === "streaming")) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Working...
            </div>
          )}
        </div>
      </div>

      <ChatInput onSend={sendMessage} disabled={isBusy} />
    </div>
  );
}

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
