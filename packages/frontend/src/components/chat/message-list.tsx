import { useMemo } from "react";
import { Brain } from "lucide-react";
import type { StoredMessage } from "@code-artisan/shared";
import {
  AssistantText,
  CompactedBlock,
  ThinkingQuote,
  UserBubble,
} from "@/components/chat/message-bubble";
import { TodoListCard } from "@/components/chat/todo-list-card";
import { ToolCallItem } from "@/components/chat/tool-call-item";
import { buildChunks, type RenderChunk } from "@/components/chat/message-chunks";
import type { ChatStatus } from "@/hooks/use-chat";

interface MessageListProps {
  messages: StoredMessage[];
  status: ChatStatus;
}

export function MessageList({ messages, status }: MessageListProps) {
  const streamingMessageId = useMemo(() => {
    if (status !== "streaming") return null;
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? last.id : null;
  }, [messages, status]);

  const chunks = useMemo(
    () => buildChunks(messages, { streamingMessageId }),
    [messages, streamingMessageId],
  );

  const showThinking = status === "submitted" || status === "running";
  const isLive = status !== "ready" && status !== "error";

  return (
    <div className="space-y-4">
      {chunks.map((chunk) => (
        <ChunkRenderer key={chunk.key} chunk={chunk} isLive={isLive} />
      ))}
      {showThinking && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Brain className="h-4 w-4 animate-pulse" />
          <span className="animate-shimmer-text font-medium">Thinking...</span>
        </div>
      )}
    </div>
  );
}

function ChunkRenderer({ chunk, isLive }: { chunk: RenderChunk; isLive: boolean }) {
  switch (chunk.kind) {
    case "user":
      return <UserBubble message={chunk.message} />;
    case "assistant-text":
      return <AssistantText text={chunk.text} />;
    case "thinking":
      return <ThinkingQuote thinking={chunk.thinking} isStreaming={chunk.isStreaming} />;
    case "todo-list":
      return <TodoListCard list={chunk} isLive={isLive} />;
    case "tool":
      return <ToolCallItem toolUse={chunk.toolUse} toolResult={chunk.toolResult} />;
    case "compacted":
      return <CompactedBlock message={chunk.message} />;
  }
}

