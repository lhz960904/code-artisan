import { useMemo } from "react";
import { Brain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { StoredMessage } from "@code-artisan/shared";
import {
  AssistantText,
  CompactedBlock,
  RestoreNodeChip,
  ThinkingQuote,
  UserBubble,
  VersionChip,
} from "@/components/chat/message-bubble";
import { TodoListCard } from "@/components/chat/todo-list-card";
import { ToolCallItem } from "@/components/chat/tool-call-item";
import { buildChunks, type RenderChunk, type VersionChipInfo } from "@/components/chat/message-chunks";
import { conversationDetailOptions, versionsListOptions } from "@/api/queries";
import { usePreviewVersion, useRestoreVersion } from "@/api/mutations";
import type { ChatStatus } from "@/hooks/use-chat";

interface MessageListProps {
  messages: StoredMessage[];
  status: ChatStatus;
  conversationId: string;
}

export function MessageList({ messages, status, conversationId }: MessageListProps) {
  const streamingMessageId = useMemo(() => {
    if (status !== "streaming") return null;
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? last.id : null;
  }, [messages, status]);

  const { data: conversation } = useQuery(conversationDetailOptions(conversationId));
  const { data: versions } = useQuery(versionsListOptions(conversationId));
  const previewVersion = usePreviewVersion(conversationId);
  const restoreVersion = useRestoreVersion(conversationId);

  const { versionByUserMessageId, versionLabelById } = useMemo(() => {
    const byUser = new Map<string, VersionChipInfo>();
    const byVersion = new Map<string, string>();
    if (!versions) return { versionByUserMessageId: undefined, versionLabelById: undefined };
    versions.forEach((v, i) => {
      const label = v.label ?? `v${i + 1}`;
      byVersion.set(v.id, label);
      if (v.createdByMessageId) {
        byUser.set(v.createdByMessageId, {
          versionId: v.id,
          versionLabel: label,
          createdAt: v.createdAt,
          fileCount: v.fileCount,
          isCurrent: v.isCurrent,
          isPreviewing: v.id === conversation?.previewingVersionId,
        });
      }
    });
    return { versionByUserMessageId: byUser, versionLabelById: byVersion };
  }, [versions, conversation?.previewingVersionId]);

  const chunks = useMemo(
    () => buildChunks(messages, { streamingMessageId, versionByUserMessageId, versionLabelById }),
    [messages, streamingMessageId, versionByUserMessageId, versionLabelById],
  );

  const showThinking = status === "submitted" || status === "running";
  const isLive = status !== "ready" && status !== "error";

  return (
    <div className="space-y-4">
      {chunks.map((chunk) => (
        <ChunkRenderer
          key={chunk.key}
          chunk={chunk}
          isLive={isLive}
          onPreviewVersion={(versionId) => previewVersion.activate(versionId)}
          onRestoreVersion={(versionId) => restoreVersion.mutate({ versionId })}
          isPreviewPending={previewVersion.isPending}
          isRestorePending={restoreVersion.isPending}
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

function ChunkRenderer({
  chunk,
  isLive,
  onPreviewVersion,
  onRestoreVersion,
  isPreviewPending,
  isRestorePending,
}: {
  chunk: RenderChunk;
  isLive: boolean;
  onPreviewVersion: (versionId: string) => void;
  onRestoreVersion: (versionId: string) => void;
  isPreviewPending: boolean;
  isRestorePending: boolean;
}) {
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
    case "version":
      return (
        <VersionChip
          versionLabel={chunk.versionLabel}
          createdAt={chunk.createdAt}
          fileCount={chunk.fileCount}
          isCurrent={chunk.isCurrent}
          isPreviewing={chunk.isPreviewing}
          onPreview={() => onPreviewVersion(chunk.versionId)}
          onRestore={() => onRestoreVersion(chunk.versionId)}
          isPending={isPreviewPending}
          isRestorePending={isRestorePending}
        />
      );
    case "restore":
      return (
        <RestoreNodeChip
          restoredToLabel={chunk.restoredToLabel}
          fromVersionLabel={chunk.fromVersionLabel}
          revertedFileCount={chunk.revertedFileCount}
        />
      );
  }
}

