import { useRef, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@/hooks/use-chat";
import { useFileUpload } from "@/hooks/use-file-upload";
import { MessageList } from "@/components/chat/message-list";
import { Sender } from "@/components/chat/sender";
import { SelectedElementChip } from "@/components/chat/selected-element-chip";
import { ElementPickerToggle } from "@/components/chat/element-picker-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { modelsOptions } from "@/api/queries";
import { usePendingPromptStore } from "@/stores/pending-prompt";
import { useWorkspaceStore } from "@/stores/workspace";
import { useModelPrefsStore } from "@/stores/model-prefs";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const fileUpload = useFileUpload();
  const { messages, status, isLoading, sendMessage, stop, error } = useChat(conversationId);
  const { data: models } = useQuery(modelsOptions());
  const { model, setModel } = useModelPrefsStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const initialSentForRef = useRef<string | null>(null);
  const pendingChatMessage = useWorkspaceStore((s) => s.pendingChatMessage);
  const setPendingChatMessage = useWorkspaceStore((s) => s.setPendingChatMessage);
  const selectedElement = useWorkspaceStore((s) => s.selectedElement);
  const setSelectedElement = useWorkspaceStore((s) => s.setSelectedElement);

  // invoke agent immediately if there is pending prompt
  useEffect(() => {
    if (!conversationId || status !== "ready") return;
    if (initialSentForRef.current === conversationId) return;
    const pending = usePendingPromptStore.getState().consumeForConversation(conversationId);
    if (!pending) return;
    initialSentForRef.current = conversationId;
    sendMessage(pending.prompt, {
      attachments: pending.attachments.length > 0 ? pending.attachments : undefined,
      model,
    });
  }, [conversationId, status, sendMessage, model]);

  // send pending chat message triggered by workspace UI (e.g. Preview panel "Start Server" button)
  useEffect(() => {
    if (status !== "ready" || !pendingChatMessage) return;
    setPendingChatMessage(null);
    sendMessage(pendingChatMessage, { model });
  }, [pendingChatMessage, status, sendMessage, setPendingChatMessage, model]);

  // scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isBusy = status !== "ready" && status !== "error";

  const handleSend = async (content: string) => {
    const attachments = fileUpload.hasFiles ? fileUpload.attachments : undefined;
    fileUpload.clear();
    const elementSnapshot = selectedElement;
    if (elementSnapshot) setSelectedElement(null);
    sendMessage(content, {
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      selectedElement: elementSnapshot ?? undefined,
      model,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {isLoading && messages.length === 0 ? (
          <MessageListSkeleton />
        ) : (
          <>
            <MessageList messages={messages} status={status} />
            {status === "error" && error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">{error.message}</div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-3">
        <Sender
          onSubmit={handleSend}
          busy={isBusy}
          onStop={stop}
          files={fileUpload.files}
          onAddFiles={fileUpload.addFiles}
          onRemoveFile={fileUpload.removeFile}
          isUploading={fileUpload.isUploading}
          models={models}
          modelId={model}
          onModelChange={setModel}
          headerSlot={<SelectedElementChip />}
          actionsSlot={<ElementPickerToggle />}
        />
      </div>
    </div>
  );
}

function MessageListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Skeleton className="h-14 w-3/5 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-2/5 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
