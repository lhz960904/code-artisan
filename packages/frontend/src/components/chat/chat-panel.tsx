import { useMemo, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useFileUpload } from "@/hooks/use-file-upload";
import { MessageBubble, buildToolResultLookup } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { useWorkspaceStore } from "@/stores/workspace";
import { useMessages, fetchMessages } from "@/lib/apis";
import type {
  StoredMessage,
  StoredAssistantMessage,
  Attachment,
  ToolUseContent,
} from "@code-artisan/shared";

interface ChatPanelProps {
  conversationId: string;
  initialMessage?: string;
}

export function ChatPanel({ conversationId, initialMessage }: ChatPanelProps) {
  const { data: fetchedMessages } = useMessages(conversationId);
  const fileUpload = useFileUpload();

  const initialMessages: StoredMessage[] | undefined = fetchedMessages?.length
    ? fetchedMessages
    : undefined;

  const updateFile = useWorkspaceStore((s) => s.updateFile);
  const deleteFile = useWorkspaceStore((s) => s.deleteFile);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const appendTerminal = useWorkspaceStore((s) => s.appendTerminal);
  const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl);
  const loadSnapshots = useWorkspaceStore((s) => s.loadSnapshots);

  const { messages, status, sendMessage: chatSendMessage } = useChat(
    conversationId,
    {
      initialMessages,
      fetchMessages,
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
    loadSnapshots(conversationId);
    processedRef.current = new Set();
  }, [conversationId, loadSnapshots]);

  // Auto-send initialMessage from home page navigation (once per conversation).
  useEffect(() => {
    if (
      initialMessage &&
      conversationId &&
      initialSentForRef.current !== conversationId &&
      status === "ready"
    ) {
      initialSentForRef.current = conversationId;
      chatSendMessage(initialMessage);
    }
  }, [initialMessage, conversationId, status, chatSendMessage]);

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
    let attachments: Attachment[] | undefined;
    if (fileUpload.hasFiles) {
      attachments = await fileUpload.uploadAll();
      fileUpload.clear();
    }
    chatSendMessage(content, attachments);
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

      <ChatInput
        onSend={handleSend}
        disabled={isBusy}
        files={fileUpload.files}
        onAddFiles={fileUpload.addFiles}
        onRemoveFile={fileUpload.removeFile}
        isUploading={fileUpload.isUploading}
      />
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
