import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

export interface VersionListItem {
  id: string;
  parentVersionId: string | null;
  createdByMessageId: string | null;
  label: string | null;
  fileCount: number;
  totalBytes: number;
  createdAt: string;
  isCurrent: boolean;
}

export interface VersionFile {
  path: string;
  content: string;
}

export const versionKeys = {
  list: (conversationId: string) => ["versions", "list", conversationId] as const,
  files: (conversationId: string, versionId: string) =>
    ["versions", "files", conversationId, versionId] as const,
};

export function fetchVersionsList(conversationId: string) {
  return apiFetch<VersionListItem[]>(`/conversation/${conversationId}/versions`);
}

export function fetchVersionFiles(conversationId: string, versionId: string) {
  return apiFetch<VersionFile[]>(`/conversation/${conversationId}/versions/${versionId}/files`);
}

export const versionsListOptions = (conversationId: string) =>
  queryOptions({
    queryKey: versionKeys.list(conversationId),
    queryFn: () => fetchVersionsList(conversationId),
    staleTime: 5_000,
  });

export const versionFilesOptions = (conversationId: string, versionId: string) =>
  queryOptions({
    queryKey: versionKeys.files(conversationId, versionId),
    queryFn: () => fetchVersionFiles(conversationId, versionId),
    // Versions are immutable — once fetched, content never changes.
    staleTime: Infinity,
  });
