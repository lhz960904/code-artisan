import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { ToolCallItem } from "@/components/chat/tool-call-item";
import type {
  StoredMessage,
  StoredAssistantMessage,
  StoredUserMessage,
  ToolUseContent,
  ToolResultContent,
} from "@code-artisan/shared";

interface MessageBubbleProps {
  message: StoredMessage;
  /** Lookup tool_use_id → ToolResultContent from messages later in the thread. */
  toolResultLookup: Map<string, ToolResultContent>;
}

export function MessageBubble({ message, toolResultLookup }: MessageBubbleProps) {
  // Compaction divider
  if (message.metadata?.compacted) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">Conversation compacted</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  // Tool-role messages are consumed by their paired assistant's
  // ToolCallItem — skip here to avoid rendering outputs twice.
  if (message.role === "tool") return null;

  if (message.role === "user") {
    return <UserBubble message={message as StoredUserMessage} />;
  }

  if (message.role === "assistant") {
    return (
      <AssistantBubble
        message={message as StoredAssistantMessage}
        toolResultLookup={toolResultLookup}
      />
    );
  }

  return null;
}

function UserBubble({ message }: { message: StoredUserMessage }) {
  const hasAny = message.content.length > 0;
  if (!hasAny) return null;

  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-2">
        {/* Images first */}
        {message.content.some((c) => c.type === "image_url") && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.content.map((c, i) =>
              c.type === "image_url" ? (
                <img
                  key={`img-${i}`}
                  src={resolveImageUrl(c.image_url.url)}
                  alt="attachment"
                  className="max-h-48 max-w-64 rounded-lg border border-border object-cover"
                />
              ) : null,
            )}
          </div>
        )}
        {/* Then all text */}
        {message.content.some((c) => c.type === "text") && (
          <div className="rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap">
            {message.content
              .filter((c): c is { type: "text"; text: string } => c.type === "text")
              .map((c) => c.text)
              .join("\n")}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  toolResultLookup,
}: {
  message: StoredAssistantMessage;
  toolResultLookup: Map<string, ToolResultContent>;
}) {
  return (
    <div className="space-y-2">
      {message.content.map((part, i) => {
        if (part.type === "text") {
          return (
            <div key={i} className="text-sm leading-relaxed text-foreground">
              <MarkdownRenderer content={part.text} />
            </div>
          );
        }
        if (part.type === "thinking") {
          return (
            <ThinkingBlock key={i} thinking={part.thinking} />
          );
        }
        if (part.type === "tool_use") {
          const toolUse = part as ToolUseContent;
          const result = toolResultLookup.get(toolUse.id);
          return <ToolCallItem key={i} toolUse={toolUse} toolResult={result} />;
        }
        return null;
      })}
    </div>
  );
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 p-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        Thinking
        <span className="opacity-50">({thinking.length} chars)</span>
      </button>
      {open && (
        <div className="border-t border-border p-3 max-h-60 overflow-y-auto text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {thinking}
        </div>
      )}
    </div>
  );
}

/** Walks the message array once and builds a tool_use_id → result map. */
export function buildToolResultLookup(messages: StoredMessage[]): Map<string, ToolResultContent> {
  const map = new Map<string, ToolResultContent>();
  for (const msg of messages) {
    if (msg.role !== "tool") continue;
    for (const c of msg.content) {
      if (c.type === "tool_result") map.set(c.tool_use_id, c);
    }
  }
  return map;
}

function resolveImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  const baseUrl = import.meta.env.SUPABASE_URL as string;
  const fileId = url.replace(/^files\//, "");
  return `${baseUrl}/storage/v1/object/public/attachments/${fileId}`;
}
