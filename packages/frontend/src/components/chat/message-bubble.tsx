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
  /** Whether this message is currently being streamed. */
  isStreaming?: boolean;
}

export function MessageBubble({ message, toolResultLookup, isStreaming }: MessageBubbleProps) {
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
    return <AssistantBubble message={message as StoredAssistantMessage} toolResultLookup={toolResultLookup} isStreaming={isStreaming} />;
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
  isStreaming,
}: {
  message: StoredAssistantMessage;
  toolResultLookup: Map<string, ToolResultContent>;
  isStreaming?: boolean;
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
          // Only show thinking while streaming; hide after completion
          if (!isStreaming) return null;
          return <ThinkingBlock key={i} thinking={part.thinking} defaultOpen />;
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

function ThinkingBlock({ thinking, defaultOpen = false }: { thinking: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 p-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        Thought
      </button>
      {open && (
        <div className="border-t border-border p-3 max-h-60 overflow-y-auto text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {thinking}
        </div>
      )}
    </div>
  );
}

function resolveImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  const baseUrl = import.meta.env.SUPABASE_URL as string;
  const fileId = url.replace(/^files\//, "");
  return `${baseUrl}/storage/v1/object/public/attachments/${fileId}`;
}
