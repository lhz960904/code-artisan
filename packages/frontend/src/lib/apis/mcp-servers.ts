import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { McpServerListItem } from "@code-artisan/shared";

// ============================================================
// Fetch
// ============================================================

const mcpServersApi = {
  list: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiFetch<McpServerListItem[]>(`/setting${params}`);
  },
  install: (serverId: string, envVars: Record<string, string>) =>
    apiFetch<{ serverId: string }>("/setting/install", {
      method: "POST",
      body: JSON.stringify({ serverId, envVars }),
    }),
  uninstall: (serverId: string) =>
    apiFetch<{ serverId: string }>(`/setting/${serverId}`, { method: "DELETE" }),
  update: (serverId: string, envVars: Record<string, string>) =>
    apiFetch<{ serverId: string }>(`/setting/${serverId}`, {
      method: "PATCH",
      body: JSON.stringify({ envVars }),
    }),
};

// ============================================================
// Hooks
// ============================================================

export function useMcpServers(search?: string) {
  return useQuery({
    queryKey: ["mcp-servers", search ?? ""],
    queryFn: () => mcpServersApi.list(search),
  });
}

export function useInstallMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, envVars }: { serverId: string; envVars: Record<string, string> }) =>
      mcpServersApi.install(serverId, envVars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });
}

export function useUninstallMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => mcpServersApi.uninstall(serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });
}

export function useUpdateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, envVars }: { serverId: string; envVars: Record<string, string> }) =>
      mcpServersApi.update(serverId, envVars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });
}
