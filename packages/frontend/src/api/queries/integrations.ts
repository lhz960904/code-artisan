import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

export type VercelIntegrationStatus =
  | { connected: false }
  | {
      connected: true;
      user_name?: string;
      user_email?: string;
      team_id?: string;
      connected_at: string;
    };

export const integrationKeys = {
  vercel: () => ["integration", "vercel"] as const,
};

export const vercelIntegrationOptions = () =>
  queryOptions({
    queryKey: integrationKeys.vercel(),
    queryFn: () => apiFetch<VercelIntegrationStatus>("/integration/vercel"),
    staleTime: 30_000,
  });
