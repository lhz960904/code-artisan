import { queryOptions } from "@tanstack/react-query";
import type { Deployment } from "@code-artisan/shared";
import { apiFetch } from "@/api/client";

export const deploymentKeys = {
  list: (conversationId: string) => ["deployments", conversationId] as const,
};

export const deploymentsListOptions = (conversationId: string) =>
  queryOptions({
    queryKey: deploymentKeys.list(conversationId),
    queryFn: () => apiFetch<Deployment[]>(`/deployment/${conversationId}`),
    staleTime: 10_000,
  });
