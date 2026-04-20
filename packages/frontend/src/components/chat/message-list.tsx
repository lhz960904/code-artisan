import { useMemo } from "react";
import { Brain } from "lucide-react";
import type { StoredMessage, ToolResultContent } from "@code-artisan/shared";
import { MessageBubble } from "@/components/chat/message-bubble";
import type { ChatStatus } from "@/hooks/use-chat";

interface MessageListProps {
  messages: StoredMessage[];
  status: ChatStatus;
}

export function MessageList({ messages, status }: MessageListProps) {
  const toolResultLookup = useMemo(() => buildToolResultLookup(messages), [messages]);
  const lastMessage = messages[messages.length - 1];
  const showThinking = status === "submitted" || status === "running";

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          toolResultLookup={toolResultLookup}
          isStreaming={
            status === "streaming" && message === lastMessage && message.role === "assistant"
          }
        />
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

/** Walks the message array once and builds a tool_use_id → result map. */
function buildToolResultLookup(messages: StoredMessage[]): Map<string, ToolResultContent> {
  const map = new Map<string, ToolResultContent>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const content of message.content) {
      if (content.type === "tool_result") map.set(content.tool_use_id, content);
    }
  }
  return map;
}
