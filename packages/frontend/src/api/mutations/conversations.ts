import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConversationSettings } from "@code-artisan/shared";
import { conversationKeys, type ConversationResponse } from "@/api/queries";
import { apiFetch } from "@/api/client";

export interface ConversationUpdatePayload {
  title?: string;
  settings?: Partial<ConversationSettings>;
}

export interface ConversationShareResponse {
  shareSlug: string | null;
  sharedAt: string | null;
}

const conversationsApi = {
  create: (title?: string) =>
    apiFetch<ConversationResponse>("/conversation", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  update: (id: string, updates: ConversationUpdatePayload) =>
    apiFetch<ConversationResponse>(`/conversation/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  delete: (id: string) => apiFetch<void>(`/conversation/${id}`, { method: "DELETE" }),
  share: (id: string) =>
    apiFetch<ConversationShareResponse>(`/conversation/${id}/share`, { method: "POST" }),
  unshare: (id: string) =>
    apiFetch<ConversationShareResponse>(`/conversation/${id}/share`, { method: "DELETE" }),
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
    mutationFn: ({ id, ...updates }: { id: string } & ConversationUpdatePayload) =>
      conversationsApi.update(id, updates),
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all() });
      await queryClient.cancelQueries({ queryKey: conversationKeys.detail(id) });
      const previousList = queryClient.getQueryData<ConversationResponse[]>(conversationKeys.all());
      const previousDetail = queryClient.getQueryData<ConversationResponse>(conversationKeys.detail(id));
      const merge = (prev: ConversationResponse): ConversationResponse => ({
        ...prev,
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.settings ? { settings: { ...prev.settings, ...updates.settings } } : {}),
      });
      if (previousList) {
        queryClient.setQueryData<ConversationResponse[]>(
          conversationKeys.all(),
          previousList.map((c) => (c.id === id ? merge(c) : c)),
        );
      }
      if (previousDetail) {
        queryClient.setQueryData<ConversationResponse>(conversationKeys.detail(id), merge(previousDetail));
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

export function useShareConversation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => conversationsApi.share(id),
    onSuccess: (data) => {
      const previous = queryClient.getQueryData<ConversationResponse>(conversationKeys.detail(id));
      if (previous) {
        queryClient.setQueryData<ConversationResponse>(conversationKeys.detail(id), {
          ...previous,
          shareSlug: data.shareSlug,
          sharedAt: data.sharedAt,
        });
      }
    },
  });
}

export function useUnshareConversation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => conversationsApi.unshare(id),
    onSuccess: () => {
      const previous = queryClient.getQueryData<ConversationResponse>(conversationKeys.detail(id));
      if (previous) {
        queryClient.setQueryData<ConversationResponse>(conversationKeys.detail(id), {
          ...previous,
          shareSlug: null,
          sharedAt: null,
        });
      }
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
