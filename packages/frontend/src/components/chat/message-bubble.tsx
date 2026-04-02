import { useState } from "react";
import { ChevronRight, AlertCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { ToolCallItem } from "@/components/chat/tool-call-item";
import { ConfirmCard } from "@/components/chat/confirm-card";
import type { Message, MessagePart, ToolCallPart, ImagePart, DocumentPart } from "@code-artisan/shared";

interface MessageBubbleProps {
  message: Message;
  conversationId: string;
}

export function MessageBubble({ message, conversationId }: MessageBubbleProps) {
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

  // Skip confirm-response user messages
  if (message.role === "user" && message.metadata?.confirmResponse) return null;

  // User message
  if (message.role === "user") {
    const textParts = message.parts.filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text");
    const imageParts = message.parts.filter((p): p is ImagePart => p.type === "image");
    const docParts = message.parts.filter((p): p is DocumentPart => p.type === "document");
    const text = textParts.map((p) => p.text).join("\n");
    const hasAttachments = imageParts.length > 0 || docParts.length > 0;

    if (!text && !hasAttachments) return null;

    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2">
          {hasAttachments && (
            <div className="flex flex-wrap justify-end gap-2">
              {imageParts.map((img, i) => (
                <img
                  key={`img-${i}`}
                  src={resolveFileUrl(img.source)}
                  alt="attachment"
                  className="max-h-48 max-w-64 rounded-lg border border-border object-cover"
                />
              ))}
              {docParts.map((doc, i) => (
                <div
                  key={`doc-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
                >
                  <FileText className="h-4 w-4" />
                  {doc.title ?? "Document"}
                </div>
              ))}
            </div>
          )}
          {text && (
            <div className="rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
              {text}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant / tool messages
  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => (
        <PartRenderer
          key={`${message.id}-${i}`}
          part={part}
          message={message}
          conversationId={conversationId}
        />
      ))}
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
      if (message.role !== "assistant") return null;
      return (
        <div className="text-sm leading-relaxed text-foreground">
          <MarkdownRenderer content={part.text} />
        </div>
      );

    case "tool-call":
      return (
        <div className="space-y-1.5">
          <ToolCallItem part={part as ToolCallPart} />
          {part.approval == "pending" && (
            <ConfirmCard part={part as ToolCallPart} conversationId={conversationId} />
          )}
        </div>
      );

    case "error":
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {part.message}
        </div>
      );

    case "thinking":
      return <ThinkingBlock thinking={part.thinking} streaming={part.status === "streaming"} />;

    default:
      return null;
  }
}

function ThinkingBlock({ thinking, streaming }: { thinking: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false);

  // Show content directly while streaming
  if (streaming) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
          Thinking...
        </div>
        <div className="max-h-40 overflow-y-auto text-xs leading-relaxed text-muted-foreground/80 whitespace-pre-wrap">
          {thinking}
        </div>
      </div>
    );
  }

  // Collapsible after done
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

function resolveFileUrl(source: ImagePart["source"] | DocumentPart["source"]): string {
  if (source.type === "base64") return `data:image/png;base64,${source.data}`;
  if (source.type === "url") {
    const url = source.url;
    if (url.startsWith("http")) return url;
    const baseUrl = import.meta.env.SUPABASE_URL as string;
    const fileId = url.replace(/^files\//, "");
    return `${baseUrl}/storage/v1/object/public/attachments/${fileId}`;
  }
  return "";
}
