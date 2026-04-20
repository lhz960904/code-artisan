import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Attachment,
  ImageURLContent,
  StoredMessage,
  StoredUserMessage,
  TextContent,
  WebAgentEvent,
} from "@code-artisan/shared";
import { API_BASE } from "@/api/client";
import { conversationKeys, conversationMessagesOptions } from "@/api/queries";

export type ChatStatus = "ready" | "submitted" | "running" | "error";

export interface UseChatOptions {
  onFinish?: () => void;
  onError?: (error: Error) => void;
}

export interface UseChatReturn {
  messages: StoredMessage[];
  status: ChatStatus;
  isLoading: boolean;
  sendMessage: (content: string, attachments?: Attachment[]) => void;
  stop: () => void;
  error: Error | null;
}

export function useChat(
  conversationId: string | null,
  options: UseChatOptions = {},
): UseChatReturn {
  const queryClient = useQueryClient();

  const { data: messages = [], isPending } = useQuery({
    ...conversationMessagesOptions(conversationId ?? ""),
    enabled: !!conversationId,
  });

  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const streamingIdRef = useRef(`streaming-${Date.now()}`);

  const updateMessages = useCallback(
    (updater: (prev: StoredMessage[]) => StoredMessage[]) => {
      if (!conversationId) return;
      queryClient.setQueryData<StoredMessage[]>(
        conversationKeys.messages(conversationId),
        (prev) => updater(prev ?? []),
      );
    },
    [conversationId, queryClient],
  );

  const handleEvent = useCallback(
    (event: WebAgentEvent) => {
      switch (event.type) {
        case "partial": {
          setStatus("running");
          const streamId = streamingIdRef.current;
          const stored = {
            ...event.message,
            id: streamId,
            conversationId: conversationId ?? "",
            createdAt: new Date().toISOString(),
          } as StoredMessage;
          updateMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === streamId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = stored;
              return next;
            }
            return [...prev, stored];
          });
          break;
        }
        case "message": {
          setStatus("running");
          const msg = event.message;
          const id = (msg as StoredMessage).id ?? `msg-${Date.now()}`;
          const stored = {
            ...msg,
            id,
            conversationId: conversationId ?? "",
            createdAt: new Date().toISOString(),
          } as StoredMessage;
          updateMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== streamingIdRef.current);
            return [...filtered, stored];
          });
          streamingIdRef.current = `streaming-${Date.now()}`;
          break;
        }
        case "quota_exceeded":
          setStatus("error");
          setError(new Error("Token quota exceeded"));
          break;
        case "error":
          setStatus("error");
          setError(new Error(event.message));
          break;
      }
    },
    [conversationId, updateMessages],
  );

  const readStream = useCallback(
    async (body: ReadableStream<Uint8Array>, signal: AbortSignal) => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop()!;

          for (const part of parts) {
            for (const line of part.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              try {
                handleEvent(JSON.parse(data) as WebAgentEvent);
              } catch {
                console.warn("[useChat] failed to parse SSE data:", data);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
    [handleEvent],
  );

  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!conversationId || status === "submitted" || status === "running") return;

      const optId = `opt-${Date.now()}`;
      const optContent: Array<TextContent | ImageURLContent> = [];
      if (attachments) {
        for (const att of attachments) {
          if (att.mimeType.startsWith("image/")) {
            optContent.push({
              type: "image_url",
              image_url: { url: `files/${att.fileId}` },
            });
          } else {
            optContent.push({ type: "text", text: `[File: ${att.fileName}]` });
          }
        }
      }
      if (content) optContent.push({ type: "text", text: content });

      updateMessages((prev) => [
        ...prev,
        {
          id: optId,
          conversationId,
          role: "user",
          content: optContent,
          createdAt: new Date().toISOString(),
        } as StoredUserMessage,
      ]);
      setStatus("submitted");
      setError(null);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch(`${API_BASE}/message/${conversationId}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, attachments }),
          signal: abort.signal,
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        if (!res.body) throw new Error("No response body");

        setStatus("running");
        await readStream(res.body, abort.signal);

        setStatus((prev) => (prev === "error" ? prev : "ready"));
        optionsRef.current.onFinish?.();
      } catch (err) {
        if (abort.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setStatus("error");
        setError(error);
        optionsRef.current.onError?.(error);
      } finally {
        abortRef.current = null;
      }
    },
    [conversationId, status, readStream, updateMessages],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [conversationId]);

  return {
    messages,
    status,
    isLoading: isPending && !!conversationId,
    sendMessage,
    stop,
    error,
  };
}
