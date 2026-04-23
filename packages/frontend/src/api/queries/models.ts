import { queryOptions } from "@tanstack/react-query";
import { SUPPORTED_MODELS, type ModelInfo } from "@code-artisan/shared";
import { apiFetch } from "@/api/client";

export const modelKeys = {
  list: () => ["models"] as const,
};

export function fetchModels() {
  return apiFetch<ModelInfo[]>("/models");
}

// initialData = static shared list so unauthenticated pages (Home) render instantly;
// authed pages refetch and pick up server-side user-tier filtering transparently.
export const modelsOptions = () =>
  queryOptions({
    queryKey: modelKeys.list(),
    queryFn: fetchModels,
    staleTime: 5 * 60_000,
    initialData: SUPPORTED_MODELS,
  });
