import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";

// ============================================================
// Types
// ============================================================

export interface QuotaResponse {
  totalTokens: number;
  usedTokens: number;
  remaining: number;
}

// ============================================================
// Fetch + Hook
// ============================================================

export function useQuota() {
  return useQuery({
    queryKey: ["quota"],
    queryFn: () => apiFetch<QuotaResponse>("/quota"),
  });
}
