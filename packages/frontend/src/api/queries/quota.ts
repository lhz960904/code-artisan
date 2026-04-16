import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

export interface QuotaResponse {
  totalTokens: number;
  usedTokens: number;
  remaining: number;
}

export const quotaKeys = {
  detail: () => ["quota"] as const,
};

export function fetchQuota() {
  return apiFetch<QuotaResponse>("/user/quota");
}

export const quotaOptions = () =>
  queryOptions({
    queryKey: quotaKeys.detail(),
    queryFn: fetchQuota,
    staleTime: 30_000,
  });
