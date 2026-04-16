import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mcpServerKeys } from "@/api/queries";
import { apiFetch } from "@/api/client";

const mcpServersApi = {
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

export function useInstallMcpServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId, envVars }: { serverId: string; envVars: Record<string, string> }) =>
      mcpServersApi.install(serverId, envVars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpServerKeys.lists() });
    },
  });
}

export function useUninstallMcpServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverId: string) => mcpServersApi.uninstall(serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpServerKeys.lists() });
    },
  });
}

export function useUpdateMcpServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId, envVars }: { serverId: string; envVars: Record<string, string> }) =>
      mcpServersApi.update(serverId, envVars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpServerKeys.lists() });
    },
  });
}
