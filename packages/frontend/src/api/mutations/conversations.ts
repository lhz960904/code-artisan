import { useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationKeys, type ConversationResponse } from "@/api/queries";
import { apiFetch } from "@/api/client";

const conversationsApi = {
  create: (title?: string) =>
    apiFetch<ConversationResponse>("/conversation", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  update: (id: string, updates: { title?: string }) =>
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
    mutationFn: ({ id, ...updates }: { id: string; title?: string }) =>
      conversationsApi.update(id, updates),
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all() });
      await queryClient.cancelQueries({ queryKey: conversationKeys.detail(id) });
      const previousList = queryClient.getQueryData<ConversationResponse[]>(conversationKeys.all());
      const previousDetail = queryClient.getQueryData<ConversationResponse>(conversationKeys.detail(id));
      if (previousList) {
        queryClient.setQueryData<ConversationResponse[]>(
          conversationKeys.all(),
          previousList.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        );
      }
      if (previousDetail) {
        queryClient.setQueryData<ConversationResponse>(conversationKeys.detail(id), {
          ...previousDetail,
          ...updates,
        });
      }
      return { previousList, previousDetail };
    },
    onError: (_err, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(conversationKeys.all(), context.previousList);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(conversationKeys.detail(variables.id), context.previousDetail);
      }
    },
    onSettled: (_data, _err, variables) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all() });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(variables.id) });
    },
  });
}

export function useConversationDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all() });
      const previous = queryClient.getQueryData<ConversationResponse[]>(conversationKeys.all());
      if (previous) {
        queryClient.setQueryData<ConversationResponse[]>(
          conversationKeys.all(),
          previous.filter((c) => c.id !== id),
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationKeys.all(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all() });
    },
  });
}
