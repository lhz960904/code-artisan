import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { StoredMessage, Attachment } from "@code-artisan/shared";
import { apiFetch } from "./client";

// ============================================================
// Types
// ============================================================

export interface ConversationResponse {
  id: string;
  userId: string;
  title: string | null;
  mode: string;
  sandboxId: string | null;
  deployUrl: string | null;
  agentRunning: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FileSnapshot {
  path: string;
  content: string;
  updatedAt: string;
}

// ============================================================
// Fetch — paths match backend route mounts:
//   /api/conversation  → conversationRouter
//   /api/message       → messageRouter
//   /api/snapshot      → snapshotRouter
// ============================================================

const conversations = {
  list: () => apiFetch<ConversationResponse[]>("/conversation"),
  get: (id: string) => apiFetch<ConversationResponse>(`/conversation/${id}`),
  create: (title?: string) =>
    apiFetch<ConversationResponse>("/conversation", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  update: (id: string, updates: { title?: string; mode?: string }) =>
    apiFetch<ConversationResponse>(`/conversation/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/conversation/${id}`, { method: "DELETE" }),
};

export const fetchMessages = (conversationId: string) =>
  apiFetch<StoredMessage[]>(`/message/${conversationId}`);

export const fetchFileSnapshots = (conversationId: string) =>
  apiFetch<FileSnapshot[]>(`/snapshot/${conversationId}`);

// ============================================================
// Hooks
// ============================================================

export function useConversations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: conversations.list,
    enabled: options?.enabled ?? true,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => conversations.get(id),
    enabled: !!id,
  });
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ["conversations", conversationId, "messages"],
    queryFn: () => fetchMessages(conversationId),
    enabled: !!conversationId,
  });
}

export function useConversationCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string | void) => conversations.create(title ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useConversationUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string; title?: string; mode?: string }) =>
      conversations.update(id, updates),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations", variables.id] });
    },
  });
}

export function useConversationDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversations.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useFileSnapshots(conversationId: string) {
  return useQuery({
    queryKey: ["conversations", conversationId, "files"],
    queryFn: () => fetchFileSnapshots(conversationId),
    enabled: !!conversationId,
  });
}
