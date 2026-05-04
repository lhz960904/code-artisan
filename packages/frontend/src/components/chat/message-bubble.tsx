import { useState } from "react";
import { Archive, Brain, ChevronRight, Eye, File as FileIcon, GitCommit, MousePointerClick, RotateCcw, Undo2 } from "lucide-react";
import { cn, resolveAttachmentUrl } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import type {
  Attachment,
  SelectedElement,
  StoredMessage,
  StoredUserMessage,
} from "@code-artisan/shared";

export function UserBubble({ message }: { message: StoredUserMessage }) {
  const attachments = (message.metadata?.attachments ?? []) as Attachment[];
  const selectedElement = message.metadata?.selectedElement as SelectedElement | undefined;
  const text = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  if (attachments.length === 0 && !text && !selectedElement) return null;

  return (
    <div className="flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end gap-2">
        {selectedElement && <SelectedElementMessageChip element={selectedElement} />}
        {attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {attachments.map((attachment) =>
              attachment.mimeType.startsWith("image/") ? (
                <ImageThumbnail key={attachment.fileId} attachment={attachment} />
              ) : (
                <FileChip key={attachment.fileId} attachment={attachment} />
              ),
            )}
          </div>
        )}
        {text && (
          <div className="rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedElementMessageChip({ element }: { element: SelectedElement }) {
  const preview = element.textContent || element.selector;
  const tooltip = `<${element.tagName}> ${element.selector}`;
  return (
    <div
      className="inline-flex min-w-0 max-w-[280px] items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px]"
      title={tooltip}
    >
      <MousePointerClick className="h-3 w-3 shrink-0 text-primary" />
      <span className="shrink-0 font-mono font-medium text-primary">
        &lt;{element.tagName}&gt;
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{preview}</span>
    </div>
  );
}

export function AssistantText({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground">
      <MarkdownRenderer content={text} />
    </div>
  );
}

export function ThinkingQuote({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
  const streaming = !!isStreaming;
  const [override, setOverride] = useState<boolean | null>(null);
  const [prevStreaming, setPrevStreaming] = useState(streaming);

  // Reset the user's toggle on each streaming transition; default snaps back
  // to expanded (while streaming) or collapsed (once done).
  if (prevStreaming !== streaming) {
    setPrevStreaming(streaming);
    setOverride(null);
  }

  const open = override ?? streaming;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => !streaming && setOverride(!open)}
        disabled={streaming}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:cursor-default"
      >
        {streaming ? (
          <>
            <Brain className="h-3.5 w-3.5 animate-pulse" />
            <span className="animate-shimmer-text font-medium">Thinking</span>
          </>
        ) : (
          <>
            <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
            <span className="font-medium">Thought</span>
          </>
        )}
      </button>
      {open && (
        <div className="border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {thinking}
        </div>
      )}
    </div>
  );
}

export function CompactedBlock({ message }: { message: StoredMessage }) {
  const [open, setOpen] = useState(false);
  const summary = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted/40 transition-colors"
      >
        <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">Previous conversation compacted</div>
          <div className="text-muted-foreground">Earlier messages replaced with a summary</div>
        </div>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && summary && (
        <div className="border-t border-border/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {summary}
        </div>
      )}
    </div>
  );
}

interface VersionChipProps {
  versionLabel: string;
  createdAt: string;
  fileCount: number;
  isCurrent: boolean;
  isPreviewing: boolean;
  onPreview?: () => void;
  onRestore?: () => void;
  isPending?: boolean;
  isRestorePending?: boolean;
}

export function VersionChip({
  versionLabel,
  createdAt,
  fileCount,
  isCurrent,
  isPreviewing,
  onPreview,
  onRestore,
  isPending,
  isRestorePending,
}: VersionChipProps) {
  const previewDisabled = !onPreview || isPending || isRestorePending;
  const restoreDisabled = !onRestore || isCurrent || isPending || isRestorePending;
  return (
    <div
      className={cn(
        "flex w-full items-stretch gap-1 rounded-lg border transition-colors",
        "border-primary/25 bg-primary/10",
        isPreviewing && "border-amber-500/60 bg-amber-500/15",
      )}
    >
      <button
        type="button"
        onClick={onPreview}
        disabled={previewDisabled}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg px-3 py-2.5 text-left transition-colors",
          "hover:bg-primary/10 disabled:opacity-60 disabled:hover:bg-transparent",
          isPreviewing && "hover:bg-amber-500/10",
        )}
      >
        <GitCommit
          className={cn(
            "h-4 w-4 shrink-0",
            isPreviewing ? "text-amber-600 dark:text-amber-400" : "text-primary",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="tabular-nums">{versionLabel}</span>
            {isCurrent && (
              <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                latest
              </span>
            )}
            {isPreviewing && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                previewing
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {fileCount} {fileCount === 1 ? "file" : "files"} · {formatTimestamp(createdAt)}
          </div>
        </div>
        {isPreviewing && <Eye className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
      </button>
      {!isCurrent && (
        <button
          type="button"
          onClick={onRestore}
          disabled={restoreDisabled}
          title="Restore to this version"
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-r-lg border-l border-primary/15 px-3 text-xs font-medium transition-colors",
            "text-primary hover:bg-primary/15 disabled:opacity-60 disabled:hover:bg-transparent",
            isPreviewing && "border-amber-500/30 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400",
          )}
        >
          <Undo2 className="h-3.5 w-3.5" />
          <span>Restore</span>
        </button>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface RestoreNodeChipProps {
  restoredToLabel: string;
  fromVersionLabel: string | null;
  revertedFileCount: number;
}

export function RestoreNodeChip({
  restoredToLabel,
  fromVersionLabel,
  revertedFileCount,
}: RestoreNodeChipProps) {
  const detail =
    fromVersionLabel
      ? `${fromVersionLabel} → ${restoredToLabel}`
      : `Restored to ${restoredToLabel}`;
  return (
    <div className="my-1 flex items-center gap-3" aria-label={`Restored to ${restoredToLabel}`}>
      <div className="flex-1 border-t border-dashed border-border/70" />
      <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
        <RotateCcw className="h-3 w-3" />
        <span className="tabular-nums font-medium text-foreground/80">{detail}</span>
        {revertedFileCount > 0 && (
          <span>
            · {revertedFileCount} {revertedFileCount === 1 ? "file" : "files"} reverted
          </span>
        )}
      </div>
      <div className="flex-1 border-t border-dashed border-border/70" />
    </div>
  );
}

function ImageThumbnail({ attachment }: { attachment: Attachment }) {
  return (
    <img
      src={resolveAttachmentUrl(attachment.fileId)}
      alt={attachment.fileName}
      className="h-14 w-14 rounded-lg border border-border object-cover"
    />
  );
}

function FileChip({ attachment }: { attachment: Attachment }) {
  return (
    <div className="flex h-14 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-xs">
      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{attachment.fileName}</div>
        <div className="text-muted-foreground">{formatBytes(attachment.size)}</div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

