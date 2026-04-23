import { queryOptions } from "@tanstack/react-query";
import type { StoredMessage } from "@code-artisan/shared";
import { apiFetch } from "@/api/client";

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
  /** Only populated by GET /conversation/:id. List endpoint omits it. */
  previewUrl?: string | null;
}

export interface FileSnapshot {
  path: string;
  content: string;
  updatedAt: string;
}

export const conversationKeys = {
  all: () => ["conversations"] as const,
  detail: (id: string) => ["conversations", "detail", id] as const,
  messages: (conversationId: string) => ["conversations", "messages", conversationId] as const,
  snapshots: (conversationId: string) => ["conversations", "snapshots", conversationId] as const,
};

export function fetchConversations() {
  return apiFetch<ConversationResponse[]>("/conversation");
}

export function fetchConversationDetail(id: string) {
  return apiFetch<ConversationResponse>(`/conversation/${id}`);
}

export function fetchConversationMessages(conversationId: string) {
  return apiFetch<StoredMessage[]>(`/message/${conversationId}`);
}

export function fetchFileSnapshots(conversationId: string) {
  return apiFetch<FileSnapshot[]>(`/snapshot/${conversationId}`);
}

export const conversationsListOptions = () =>
  queryOptions({
    queryKey: conversationKeys.all(),
    queryFn: fetchConversations,
    staleTime: 30_000,
  });

export const conversationDetailOptions = (id: string) =>
  queryOptions({
    queryKey: conversationKeys.detail(id),
    queryFn: () => fetchConversationDetail(id),
    staleTime: 30_000,
  });

export const conversationMessagesOptions = (conversationId: string) =>
  queryOptions({
    queryKey: conversationKeys.messages(conversationId),
    queryFn: () => fetchConversationMessages(conversationId),
    staleTime: 5_000,
  });

export const fileSnapshotsOptions = (conversationId: string) =>
  queryOptions({
    queryKey: conversationKeys.snapshots(conversationId),
    queryFn: () => fetchFileSnapshots(conversationId),
    staleTime: 5_000,
  });
