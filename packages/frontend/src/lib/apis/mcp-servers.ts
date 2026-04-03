import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { McpServerListItem } from "@code-artisan/shared";

// ============================================================
// Fetch
// ============================================================

const mcpServersApi = {
  list: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiFetch<McpServerListItem[]>(`/mcp-servers${params}`);
  },
  install: (serverId: string, envVars: Record<string, string>) =>
    apiFetch<{ id: string }>("/mcp-servers/install", {
      method: "POST",
      body: JSON.stringify({ serverId, envVars }),
    }),
  uninstall: (id: string) =>
    apiFetch<{ success: boolean }>(`/mcp-servers/${id}`, { method: "DELETE" }),
  update: (id: string, envVars: Record<string, string>) =>
    apiFetch<{ success: boolean }>(`/mcp-servers/${id}`, {
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
    mutationFn: (id: string) => mcpServersApi.uninstall(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });
}

export function useUpdateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, envVars }: { id: string; envVars: Record<string, string> }) =>
      mcpServersApi.update(id, envVars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });
}
