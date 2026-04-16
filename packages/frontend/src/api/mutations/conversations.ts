import { useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationKeys, type ConversationResponse } from "@/api/queries";
import { apiFetch } from "@/api/client";

const conversationsApi = {
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
  delete: (id: string) => apiFetch<void>(`/conversation/${id}`, { method: "DELETE" }),
};

export function useConversationCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title?: string | void) => conversationsApi.create(title ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all() });
    },
  });
}

export function useConversationUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string; title?: string; mode?: string }) =>
      conversationsApi.update(id, updates),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all() });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(variables.id) });
    },
  });
}

export function useConversationDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all() });
    },
  });
}
