import { queryOptions } from "@tanstack/react-query";
import type { McpServerListItem } from "@code-artisan/shared";
import { apiFetch } from "@/api/client";

export type { McpServerListItem };

export const mcpServerKeys = {
  lists: () => ["mcp-servers", "list"] as const,
  list: (search?: string) => ["mcp-servers", "list", search ?? ""] as const,
};

export function fetchMcpServers(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch<McpServerListItem[]>(`/setting${params}`);
}

export const mcpServersListOptions = (search?: string) =>
  queryOptions({
    queryKey: mcpServerKeys.list(search),
    queryFn: () => fetchMcpServers(search),
    staleTime: 30_000,
  });
