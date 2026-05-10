import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

export const databaseKeys = {
  all: (conversationId: string) => ["database", conversationId] as const,
  tables: (conversationId: string) => ["database", conversationId, "tables"] as const,
  rows: (conversationId: string, name: string, limit: number, offset: number) =>
    ["database", conversationId, "tables", name, { limit, offset }] as const,
};

export interface DatabaseTablesResponse {
  tables: string[];
}

export interface DatabaseRowsResponse {
  rows: Record<string, unknown>[];
}

export function databaseTablesOptions(conversationId: string) {
  return queryOptions({
    queryKey: databaseKeys.tables(conversationId),
    queryFn: () =>
      apiFetch<DatabaseTablesResponse>(`/conversation/${conversationId}/database/tables`),
    enabled: Boolean(conversationId),
    staleTime: 10_000,
  });
}

export function databaseRowsOptions(
  conversationId: string,
  name: string,
  opts: { limit: number; offset: number },
) {
  return queryOptions({
    queryKey: databaseKeys.rows(conversationId, name, opts.limit, opts.offset),
    queryFn: () =>
      apiFetch<DatabaseRowsResponse>(
        `/conversation/${conversationId}/database/tables/${name}?limit=${opts.limit}&offset=${opts.offset}`,
      ),
    enabled: Boolean(conversationId && name),
    staleTime: 5_000,
  });
}
