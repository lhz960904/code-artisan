import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

// ============================================================
// Types
// ============================================================

export interface ConversationResponse {
  id: string;
  user_id: string;
  title: string | null;
  mode: string;
  sandbox_id: string | null;
  deploy_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileSnapshot {
  path: string;
  content: string;
  updatedAt: string;
}

// ============================================================
// Fetch
// ============================================================

const conversations = {
  list: () => apiFetch<ConversationResponse[]>("/conversations"),
  get: (id: string) => apiFetch<ConversationResponse>(`/conversations/${id}`),
  create: (title?: string) =>
    apiFetch<ConversationResponse>("/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  update: (id: string, updates: { title?: string; mode?: string }) =>
    apiFetch<ConversationResponse>(`/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/conversations/${id}`, { method: "DELETE" }),
  sendMessage: (id: string, content: string) =>
    apiFetch<{ status: string }>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  confirm: (id: string, approved: boolean) =>
    apiFetch<{ status: string }>(`/conversations/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ approved }),
    }),
  files: (id: string) => apiFetch<FileSnapshot[]>(`/conversations/${id}/files`),
};

// ============================================================
// Hooks
// ============================================================

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: conversations.list,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => conversations.get(id),
    enabled: !!id,
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

export function useSendMessage() {
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      conversations.sendMessage(conversationId, content),
  });
}

export function useConfirmAction() {
  return useMutation({
    mutationFn: ({ conversationId, approved }: { conversationId: string; approved: boolean }) =>
      conversations.confirm(conversationId, approved),
  });
}

export function useFileSnapshots(conversationId: string) {
  return useQuery({
    queryKey: ["conversations", conversationId, "files"],
    queryFn: () => conversations.files(conversationId),
    enabled: !!conversationId,
  });
}

/** Direct fetch for non-hook contexts (e.g. WorkspaceContext) */
export const fetchFileSnapshots = conversations.files;
