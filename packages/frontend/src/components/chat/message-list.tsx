import { useMemo } from "react";
import type { StoredMessage, ToolResultContent } from "@code-artisan/shared";
import { MessageBubble } from "@/components/chat/message-bubble";

interface MessageListProps {
  messages: StoredMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const toolResultLookup = useMemo(() => buildToolResultLookup(messages), [messages]);

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          toolResultLookup={toolResultLookup}
        />
      ))}
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
