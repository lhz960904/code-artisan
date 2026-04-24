import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Attachment, StoredMessage, StoredUserMessage, TextContent, WebAgentEvent } from "@code-artisan/shared";
import { API_BASE } from "@/api/client";
import { conversationKeys, conversationMessagesOptions, quotaKeys, type ConversationResponse } from "@/api/queries";
import { useWorkspaceStore } from "@/stores/workspace";

export type ChatStatus = "ready" | "submitted" | "running" | "streaming" | "error";

export interface UseChatOptions {
  onFinish?: () => void;
  onError?: (error: Error) => void;
}

export interface SendMessageOptions {
  attachments?: Attachment[];
  model: string;
}

export interface UseChatReturn {
  messages: StoredMessage[];
  status: ChatStatus;
  isLoading: boolean;
  sendMessage: (content: string, options: SendMessageOptions) => void;
  stop: () => void;
  error: Error | null;
}

export function useChat(conversationId: string | null, options: UseChatOptions = {}): UseChatReturn {
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

  const optimisticUserIdRef = useRef<string | null>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const mountGenRef = useRef(0);

  const updateMessages = useCallback(
    (updater: (prev: StoredMessage[]) => StoredMessage[]) => {
      if (!conversationId) return;
      queryClient.setQueryData<StoredMessage[]>(conversationKeys.messages(conversationId), (prev) =>
        updater(prev ?? []),
      );
    },
    [conversationId, queryClient],
  );

  const upsertMessage = useCallback(
    (stored: StoredMessage) => {
      updateMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === stored.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = stored;
          return next;
        }
        return [...prev, stored];
      });
    },
    [updateMessages],
  );

  const handleEvent = useCallback(
    (event: WebAgentEvent) => {
      switch (event.type) {
        case "user_message_saved": {
          const optimisticId = optimisticUserIdRef.current;
          if (!optimisticId) break;
          optimisticUserIdRef.current = null;
          updateMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, id: event.messageId } : m)));
          break;
        }
        case "partial": {
          setStatus("streaming");
          upsertMessage({
            ...event.message,
            id: event.messageId,
            conversationId: conversationId ?? "",
            createdAt: new Date().toISOString(),
          } as StoredMessage);
          break;
        }
        case "message": {
          // Skip the "running" flash on the final assistant text (no tool_use) — stream close flips straight to "ready".
          const isFinalAssistant =
            event.message.role === "assistant" && !event.message.content.some((block) => block.type === "tool_use");
          if (!isFinalAssistant) setStatus("running");
          upsertMessage({
            ...event.message,
            id: event.messageId,
            conversationId: conversationId ?? "",
            createdAt: new Date().toISOString(),
          } as StoredMessage);
          break;
        }
        case "title_update": {
          if (!conversationId) break;
          queryClient.setQueryData<ConversationResponse>(conversationKeys.detail(conversationId), (prev) =>
            prev ? { ...prev, title: event.title } : prev,
          );
          queryClient.setQueryData<ConversationResponse[]>(conversationKeys.all(), (prev) =>
            prev?.map((c) => (c.id === conversationId ? { ...c, title: event.title } : c)),
          );
          break;
        }
        case "file_update": {
          const { updateFile } = useWorkspaceStore.getState();
          for (const file of event.files) updateFile(file.path, file.content);
          break;
        }
        case "file_delete": {
          const { deleteFile } = useWorkspaceStore.getState();
          for (const path of event.paths) deleteFile(path);
          break;
        }
        case "quota_exceeded":
          setStatus("error");
          setError(new Error("Token quota exceeded"));
          // Invalidate so the header token balance refreshes to 0 immediately.
          void queryClient.invalidateQueries({ queryKey: quotaKeys.detail() });
          break;
        case "interrupted":
          setStatus("ready");
          break;
        case "error":
          setStatus("error");
          setError(new Error(event.message));
          break;
      }
    },
    [conversationId, updateMessages, upsertMessage, queryClient],
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
    async (content: string, options: SendMessageOptions) => {
      if (!conversationId || status === "submitted" || status === "running") return;
      const { attachments, model } = options;

      // Cancel any in-flight GET /message/:id so the loader prefetch can't
      // settle after us and overwrite the optimistic user message + early
      // streaming updates.
      await queryClient.cancelQueries({
        queryKey: conversationKeys.messages(conversationId),
      });

      const optimisticId = crypto.randomUUID();
      optimisticUserIdRef.current = optimisticId;
      const optimisticContent: TextContent[] = content ? [{ type: "text", text: content }] : [];

      updateMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          conversationId,
          role: "user",
          content: optimisticContent,
          metadata: attachments && attachments.length > 0 ? { attachments } : undefined,
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
          body: JSON.stringify({ content, attachments, model }),
          signal: abort.signal,
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        if (!res.body) throw new Error("No response body");

        setStatus("running");
        await readStream(res.body, abort.signal);

        setStatus((prev) => (prev === "error" ? prev : "ready"));
        // Re-fetch the conversation detail so any preview URL the agent
        // exposed during the turn (or cleared via session exit) gets seeded
        // into the workspace store via ChatPage's effect.
        void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
        // Refresh the header token balance — tokens were consumed during the turn.
        void queryClient.invalidateQueries({ queryKey: quotaKeys.detail() });
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
    [conversationId, status, readStream, updateMessages, queryClient],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
    if (!conversationId) return;
    // Tell the server to abort the ReAct loop. Fire-and-forget: the local
    // fetch is already torn down, and the server emits an `interrupted`
    // event when it settles — we don't need the response here.
    void fetch(`${API_BASE}/message/${conversationId}/stop`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [conversationId]);

  // Abort only when conversationId actually changes — StrictMode's dev-only
  // mount→unmount→remount cycle must not kill the first sendMessage's fetch.
  useEffect(() => {
    const prev = prevConversationIdRef.current;
    prevConversationIdRef.current = conversationId;
    if (prev !== null && prev !== conversationId) {
      abortRef.current?.abort();
      abortRef.current = null;
      setStatus("ready");
      setError(null);
      optimisticUserIdRef.current = null;
    }
  }, [conversationId]);

  // True unmount: use a generation counter so StrictMode's simulated
  // unmount/remount (which bumps the counter before the queued abort runs)
  // is a no-op, while a real unmount leaves the generation unchanged.
  useEffect(() => {
    mountGenRef.current += 1;
    const myGen = mountGenRef.current;
    return () => {
      queueMicrotask(() => {
        if (mountGenRef.current === myGen) {
          abortRef.current?.abort();
          abortRef.current = null;
        }
      });
    };
  }, []);

  return {
    messages,
    status,
    isLoading: isPending && !!conversationId,
    sendMessage,
    stop,
    error,
  };
}
