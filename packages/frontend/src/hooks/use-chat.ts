import { useEffect, useRef, useState, useCallback } from "react";
import type { StoredMessage, WebAgentEvent, Attachment } from "@code-artisan/shared";
import { API_BASE } from "@/lib/apis/client";

export type ChatStatus = "ready" | "submitted" | "running" | "error";

export interface UseChatOptions {
  initialMessages?: StoredMessage[];
  fetchMessages: (conversationId: string) => Promise<StoredMessage[]>;
  onFinish?: () => void;
  onError?: (error: Error) => void;
  onFileChange?: (files: Array<{ path: string; content: string }>) => void;
  onFileDelete?: (paths: string[]) => void;
}

export interface UseChatReturn {
  messages: StoredMessage[];
  status: ChatStatus;
  sendMessage: (content: string, attachments?: Attachment[]) => void;
  stop: () => void;
  error: Error | null;
}

export function useChat(
  conversationId: string | null,
  options: UseChatOptions,
): UseChatReturn {
  const [messages, setMessages] = useState<StoredMessage[]>(
    options.initialMessages ?? [],
  );
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      setMessages((prev) => {
        if (prev.some((m) => m.id.startsWith("opt-"))) return prev;
        if (prev.length > options.initialMessages!.length) return prev;
        return options.initialMessages!;
      });
    }
  }, [options.initialMessages]);

  const refetchMessages = useCallback(() => {
    if (!conversationId) return;
    optionsRef.current
      .fetchMessages(conversationId)
      .then(setMessages)
      .catch(() => {});
  }, [conversationId]);

  // Stable id for the assistant message being streamed.
  const streamingIdRef = useRef(`streaming-${Date.now()}`);

  const handleEvent = useCallback(
    (event: WebAgentEvent) => {
      switch (event.type) {
        case "partial": {
          // Progressive streaming update — replace the in-flight assistant bubble.
          setStatus("running");
          const streamId = streamingIdRef.current;
          const stored = {
            ...event.message,
            id: streamId,
            conversationId: "",
            createdAt: new Date().toISOString(),
          } as StoredMessage;
          setMessages((prev) => {
            const filtered = prev.filter((m) => !m.id?.startsWith("opt-"));
            const idx = filtered.findIndex((m) => m.id === streamId);
            if (idx >= 0) {
              const next = [...filtered];
              next[idx] = stored;
              return next;
            }
            return [...filtered, stored];
          });
          break;
        }
        case "message": {
          // Final complete message — replace the streaming placeholder.
          setStatus("running");
          const msg = event.message;
          const id = (msg as StoredMessage).id ?? streamingIdRef.current;
          const stored = { ...msg, id, conversationId: "", createdAt: new Date().toISOString() } as StoredMessage;
          setMessages((prev) => {
            const filtered = prev.filter(
              (m) => !m.id?.startsWith("opt-") && m.id !== streamingIdRef.current,
            );
            return [...filtered, stored];
          });
          // Reset for next message in a multi-turn run.
          streamingIdRef.current = `streaming-${Date.now()}`;
          break;
        }
        case "file_update":
          optionsRef.current.onFileChange?.(event.files);
          break;
        case "file_delete":
          optionsRef.current.onFileDelete?.(event.paths);
          break;
        case "quota_exceeded":
          setStatus("error");
          setError(new Error("Token quota exceeded"));
          break;
      }
    },
    [],
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
      const optContent: StoredMessage["content"] = [];
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

      setMessages((prev) => [
        ...prev,
        {
          id: optId,
          conversationId,
          role: "user",
          content: optContent as StoredMessage["content"],
          createdAt: new Date().toISOString(),
        } as StoredMessage,
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

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }
        if (!res.body) {
          throw new Error("No response body");
        }

        setStatus("running");
        await readStream(res.body, abort.signal);

        setStatus("ready");
        refetchMessages();
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
    [conversationId, status, readStream, refetchMessages],
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

  return { messages, status, sendMessage, stop, error };
}
