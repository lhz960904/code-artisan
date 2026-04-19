import { useMemo, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useFileUpload } from "@/hooks/use-file-upload";
import { MessageBubble, buildToolResultLookup } from "@/components/chat/message-bubble";
import { Sender } from "@/components/chat/sender";
import { useWorkspaceStore } from "@/stores/workspace";
import { usePendingPromptStore } from "@/stores/pending-prompt";
import { fetchConversationMessages } from "@/api/queries";
import type {
  StoredMessage,
  StoredAssistantMessage,
  ToolUseContent,
} from "@code-artisan/shared";

interface ChatPanelProps {
  conversationId: string;
  initialMessages: StoredMessage[];
}

export function ChatPanel({ conversationId, initialMessages }: ChatPanelProps) {
  const fileUpload = useFileUpload();

  const updateFile = useWorkspaceStore((s) => s.updateFile);
  const deleteFile = useWorkspaceStore((s) => s.deleteFile);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const appendTerminal = useWorkspaceStore((s) => s.appendTerminal);
  const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl);

  const { messages, status, sendMessage: chatSendMessage } = useChat(
    conversationId,
    {
      initialMessages,
      fetchMessages: fetchConversationMessages,
      onFileChange: (files) => {
        for (const f of files) {
          updateFile(f.path, f.content);
          openFile(f.path);
        }
      },
      onFileDelete: (paths) => {
        for (const p of paths) deleteFile(p);
      },
    },
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(new Set<string>());
  const initialSentForRef = useRef<string | null>(null);

  useEffect(() => {
    processedRef.current = new Set();
  }, [conversationId]);

  // Auto-send the pending prompt left by Home/Dashboard (once per conversation).
  // Attachments were already uploaded at drop/paste time, so we just forward the IDs.
  useEffect(() => {
    if (!conversationId || status !== "ready") return;
    if (initialSentForRef.current === conversationId) return;
    const pending = usePendingPromptStore.getState().consumeForConversation(conversationId);
    if (!pending) return;
    initialSentForRef.current = conversationId;
    chatSendMessage(
      pending.prompt,
      pending.attachments.length > 0 ? pending.attachments : undefined,
    );
  }, [conversationId, status, chatSendMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const toolResultLookup = useMemo(() => buildToolResultLookup(messages), [messages]);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.id.startsWith("opt-")) continue;
      if (processedRef.current.has(msg.id)) continue;
      processedRef.current.add(msg.id);
      if (msg.role === "assistant") {
        processAssistantSideEffects(
          msg as StoredAssistantMessage,
          toolResultLookup,
          { updateFile, openFile, appendTerminal, setPreviewUrl },
        );
      }
    }
  }, [messages, toolResultLookup, updateFile, openFile, appendTerminal, setPreviewUrl]);

  const isBusy = status !== "ready" && status !== "error";

  const handleSend = async (content: string) => {
    const attachments = fileUpload.hasFiles ? fileUpload.attachments : undefined;
    fileUpload.clear();
    chatSendMessage(content, attachments && attachments.length > 0 ? attachments : undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              toolResultLookup={toolResultLookup}
            />
          ))}

          {isBusy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Working...
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <Sender
          onSubmit={handleSend}
          busy={isBusy}
          files={fileUpload.files}
          onAddFiles={fileUpload.addFiles}
          onRemoveFile={fileUpload.removeFile}
          isUploading={fileUpload.isUploading}
        />
      </div>
    </div>
  );
}

/**
 * Mirror tool calls into the workspace panels (file editor, terminal,
 * preview). Reads from both the tool_use (for input) and the paired
 * tool_result (for output).
 */
function processAssistantSideEffects(
  msg: StoredAssistantMessage,
  lookup: Map<string, import("@code-artisan/shared").ToolResultContent>,
  ctx: {
    updateFile: (path: string, content: string) => void;
    openFile: (path: string) => void;
    appendTerminal: (entry: { command: string; output: string }) => void;
    setPreviewUrl: (url: string | null) => void;
  },
) {
  for (const c of msg.content) {
    if (c.type !== "tool_use") continue;
    const tu = c as ToolUseContent;
    const input = tu.input as Record<string, unknown>;

    if (tu.name === "write_file" && typeof input.path === "string" && typeof input.content === "string") {
      ctx.updateFile(input.path, input.content);
      ctx.openFile(input.path);
    }

    const result = lookup.get(tu.id);
    if (!result) continue;
    const output = result.content;

    if (tu.name === "bash" && output) {
      ctx.appendTerminal({
        command: typeof input.command === "string" ? input.command : "command",
        output,
      });
    }
    if (tu.name === "read_file" && output && typeof input.path === "string") {
      ctx.updateFile(input.path, output);
      ctx.openFile(input.path);
    }
  }
  if (msg.metadata?.previewUrl) {
    ctx.setPreviewUrl(msg.metadata.previewUrl as string);
  }
}
