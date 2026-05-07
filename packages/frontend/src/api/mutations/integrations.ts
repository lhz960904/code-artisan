import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { integrationKeys } from "@/api/queries/integrations";

export function useDisconnectVercel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ disconnected: true }>("/integration/vercel", { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.vercel() });
    },
  });
}

export function useDisconnectSupabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ disconnected: true }>("/integration/supabase", { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.supabase() });
    },
  });
}
