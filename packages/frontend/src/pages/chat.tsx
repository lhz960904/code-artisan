import { useEffect, useRef } from "react";
import { createRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  conversationDetailOptions,
  conversationKeys,
  conversationMessagesOptions,
  fileSnapshotsOptions,
  quotaOptions,
  versionFilesOptions,
} from "@/api/queries";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { authedRoute } from "@/pages/layout/authed";
import { useWorkspaceStore } from "@/stores/workspace";

export const chatRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/chat/$conversationId",
  loader: ({ context: { queryClient }, params }) => {
    useWorkspaceStore.getState().reset();
    queryClient.ensureQueryData(conversationDetailOptions(params.conversationId));
    queryClient.ensureQueryData(conversationMessagesOptions(params.conversationId));
    queryClient.ensureQueryData(fileSnapshotsOptions(params.conversationId));
    queryClient.ensureQueryData(quotaOptions());
  },
  component: ChatPage,
});

export function ChatPage() {
  const { conversationId } = chatRoute.useParams();
  const { data: conversation } = useQuery(conversationDetailOptions(conversationId));
  const queryClient = useQueryClient();

  // Seed the preview URL from server state — the manager keys it by sandboxId,
  // so this rehydrates a still-alive preview after a page reload.
  const previewUrl = conversation?.previewUrl ?? null;
  useEffect(() => {
    useWorkspaceStore.getState().setPreviewUrl(previewUrl);
  }, [previewUrl, conversationId]);

  // Authoritative "are we previewing" lives on the conversation row. Mirror
  // file-tree state to it: enter preview → swap to that version's manifest;
  // exit preview → refetch fileSnapshots (latest cache) to restore current.
  const previewingVersionId = conversation?.previewingVersionId ?? null;
  const previousPreviewingRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousPreviewingRef.current;
    previousPreviewingRef.current = previewingVersionId;
    if (previewingVersionId === previous) return;

    let cancelled = false;
    if (previewingVersionId) {
      void queryClient
        .ensureQueryData(versionFilesOptions(conversationId, previewingVersionId))
        .then((files) => {
          if (cancelled) return;
          useWorkspaceStore.getState().replaceAllFiles(files);
        })
        .catch((err) => console.error("[chat] load preview version failed:", err));
    } else if (previous) {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.snapshots(conversationId) });
      void queryClient
        .fetchQuery(fileSnapshotsOptions(conversationId))
        .then((snapshots) => {
          if (cancelled) return;
          useWorkspaceStore.getState().setSnapshots(snapshots);
        })
        .catch((err) => console.error("[chat] restore latest snapshots failed:", err));
    }
    return () => {
      cancelled = true;
    };
  }, [previewingVersionId, conversationId, queryClient]);

  return <WorkspaceLayout conversationId={conversationId} />;
}
