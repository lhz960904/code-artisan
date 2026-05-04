import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StoredMessage } from "@code-artisan/shared";
import { apiFetch } from "@/api/client";
import {
  conversationKeys,
  versionKeys,
  type ConversationResponse,
  type VersionListItem,
} from "@/api/queries";

export interface PreviewVersionResult {
  syncedFiles: number;
  deletedFiles: number;
  previewingVersionId: string | null;
}

export interface RestoreVersionResult {
  restoreMessageId: string;
  currentVersionId: string;
  fromVersionId: string | null;
  revertedFileCount: number;
}

export const restoreVersionMutationKey = (conversationId: string) =>
  ["restoreVersion", conversationId] as const;

export function useRestoreVersion(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: restoreVersionMutationKey(conversationId),
    mutationFn: ({ versionId }: { versionId: string }) =>
      apiFetch<RestoreVersionResult>(
        `/conversation/${conversationId}/versions/${versionId}/restore`,
        { method: "POST" },
      ),

    // Optimistic: clear previewing immediately so the banner / Sender flips
    // back without waiting for the round-trip.
    onMutate: async ({ versionId }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.detail(conversationId) });
      const previousDetail = queryClient.getQueryData<ConversationResponse>(
        conversationKeys.detail(conversationId),
      );
      if (previousDetail) {
        queryClient.setQueryData<ConversationResponse>(conversationKeys.detail(conversationId), {
          ...previousDetail,
          previewingVersionId: null,
          currentVersionId: versionId,
        });
      }
      return { previousDetail };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(conversationKeys.detail(conversationId), context.previousDetail);
      }
    },

    // Patch caches with the server response — skip invalidate to avoid 3
    // refetches that would together cost ~700ms+ on a remote DB.
    onSuccess: (result) => {
      queryClient.setQueryData<ConversationResponse>(
        conversationKeys.detail(conversationId),
        (prev) =>
          prev
            ? { ...prev, currentVersionId: result.currentVersionId, previewingVersionId: null }
            : prev,
      );

      queryClient.setQueryData<StoredMessage[]>(
        conversationKeys.messages(conversationId),
        (prev) =>
          prev
            ? [
                ...prev,
                {
                  id: result.restoreMessageId,
                  conversationId,
                  role: "system",
                  content: [{ type: "text", text: "Restored" }],
                  metadata: {
                    type: "restore_checkpoint",
                    restoredToVersionId: result.currentVersionId,
                    fromVersionId: result.fromVersionId,
                    revertedFileCount: result.revertedFileCount,
                  },
                  createdAt: new Date().toISOString(),
                } as unknown as StoredMessage,
              ]
            : prev,
      );

      queryClient.setQueryData<VersionListItem[]>(versionKeys.list(conversationId), (prev) =>
        prev ? prev.map((v) => ({ ...v, isCurrent: v.id === result.currentVersionId })) : prev,
      );
    },
  });
}

export const previewVersionMutationKey = (conversationId: string) =>
  ["previewVersion", conversationId] as const;

export function usePreviewVersion(conversationId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: previewVersionMutationKey(conversationId),

    mutationFn: ({ versionId }: { versionId: string }) =>
      apiFetch<PreviewVersionResult>(
        `/conversation/${conversationId}/versions/${versionId}/preview`,
        { method: "POST" },
      ),

    // Optimistic: flip previewingVersionId immediately so all derived UI
    // (banner / chip / file tree via ChatPage effect) reacts in the same tick.
    // The sandbox write still takes ~1-2s; iframe HMR catches up after.
    onMutate: async ({ versionId }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.detail(conversationId) });
      const previous = queryClient.getQueryData<ConversationResponse>(
        conversationKeys.detail(conversationId),
      );
      if (!previous) return { previous: undefined };

      const targetIsCurrent = versionId === previous.currentVersionId;
      queryClient.setQueryData<ConversationResponse>(conversationKeys.detail(conversationId), {
        ...previous,
        previewingVersionId: targetIsCurrent ? null : versionId,
      });
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationKeys.detail(conversationId), context.previous);
      }
    },

    onSuccess: (result) => {
      queryClient.setQueryData<ConversationResponse>(
        conversationKeys.detail(conversationId),
        (prev) => (prev ? { ...prev, previewingVersionId: result.previewingVersionId } : prev),
      );
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
      void queryClient.invalidateQueries({ queryKey: versionKeys.list(conversationId) });
    },
  });

  // Skip if the target is already what's showing — checked before mutate runs,
  // so cache state is the user-observed state, not optimistically-patched.
  const activate = useCallback(
    (versionId: string) => {
      const conv = queryClient.getQueryData<ConversationResponse>(
        conversationKeys.detail(conversationId),
      );
      const active = conv?.previewingVersionId ?? conv?.currentVersionId ?? null;
      if (versionId === active) return;
      mutation.mutate({ versionId });
    },
    [conversationId, queryClient, mutation],
  );

  return { ...mutation, activate };
}
