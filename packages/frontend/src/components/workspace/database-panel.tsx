import { useEffect, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  conversationDetailOptions,
  databaseRowsOptions,
  databaseTablesOptions,
  supabaseIntegrationOptions,
} from "@/api/queries";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

interface DatabasePanelProps {
  conversationId: string;
}

export function DatabasePanel({ conversationId }: DatabasePanelProps) {
  const { data: conversation } = useSuspenseQuery(conversationDetailOptions(conversationId));
  const integrationQuery = useQuery(supabaseIntegrationOptions());

  if (integrationQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!integrationQuery.data?.connected) {
    return <OAuthNotConnectedState conversationId={conversationId} />;
  }
  if (!conversation.supabaseProjectRef) {
    return <NoProjectState />;
  }
  return <ConnectedDatabase conversationId={conversationId} />;
}

function OAuthNotConnectedState({ conversationId }: { conversationId: string }) {
  const openSettings = useSettingsStore((s) => s.openSettings);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <Database className="h-10 w-10 text-muted-foreground/40" />
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-medium">Connect Supabase to enable database</h3>
        <p className="text-sm text-muted-foreground">
          Connect your Supabase organization and code-artisan provisions a project per conversation.
          Tables your app creates will show up here.
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => openSettings({ section: "integrations", conversationId })}
      >
        Open Settings → Integrations
      </Button>
    </div>
  );
}

function NoProjectState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <Database className="h-10 w-10 text-muted-foreground/40" />
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-medium">No database yet</h3>
        <p className="text-sm text-muted-foreground">
          Supabase is connected, but no project has been provisioned for this
          conversation. Ask the AI to add persistence (e.g. "add a database
          with a todos table") and tables will show up here.
        </p>
      </div>
    </div>
  );
}

function ConnectedDatabase({ conversationId }: { conversationId: string }) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const tablesQuery = useQuery(databaseTablesOptions(conversationId));

  useEffect(() => {
    const tables = tablesQuery.data?.tables;
    if (!selectedTable && tables && tables.length > 0) {
      setSelectedTable(tables[0]);
    }
  }, [selectedTable, tablesQuery.data]);

  useEffect(() => {
    setOffset(0);
  }, [selectedTable]);

  return (
    <div className="flex h-full bg-background">
      <aside className="w-60 shrink-0 border-r border-border bg-card">
        <div className="flex h-9 items-center border-b border-border px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tables
        </div>
        <ScrollArea className="h-[calc(100%-2.25rem)]">
          {tablesQuery.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : tablesQuery.error ? (
            <div className="p-3 text-sm text-destructive">
              Failed to load tables.
            </div>
          ) : tablesQuery.data?.tables.length ? (
            <ul className="py-1">
              {tablesQuery.data.tables.map((name) => (
                <li key={name}>
                  <button
                    onClick={() => setSelectedTable(name)}
                    className={cn(
                      "block w-full truncate px-3 py-1.5 text-left font-mono text-sm transition-colors",
                      name === selectedTable
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3 text-sm text-muted-foreground">
              No tables yet. Tables your AI creates will appear here.
            </div>
          )}
        </ScrollArea>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedTable ? (
          <TableView
            conversationId={conversationId}
            tableName={selectedTable}
            offset={offset}
            onOffsetChange={setOffset}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a table to inspect.
          </div>
        )}
      </main>
    </div>
  );
}

interface TableViewProps {
  conversationId: string;
  tableName: string;
  offset: number;
  onOffsetChange: (next: number) => void;
}

function TableView({ conversationId, tableName, offset, onOffsetChange }: TableViewProps) {
  const rowsQuery = useQuery(
    databaseRowsOptions(conversationId, tableName, { limit: PAGE_SIZE, offset }),
  );
  const rows = rowsQuery.data?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const canPrev = offset > 0;
  // We don't COUNT(*) — too expensive on large tables. If this page is full, assume
  // there might be more; if it's short, we know we hit the end.
  const canNext = rows.length === PAGE_SIZE;

  return (
    <>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <code className="truncate font-mono text-sm font-medium">public.{tableName}</code>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {rows.length > 0 ? (
            <span className="font-mono">
              {offset + 1}–{offset + rows.length}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={!canPrev}
            onClick={() => onOffsetChange(Math.max(0, offset - PAGE_SIZE))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={!canNext}
            onClick={() => onOffsetChange(offset + PAGE_SIZE)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {rowsQuery.isLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rows…
          </div>
        ) : rowsQuery.error ? (
          <div className="p-4 text-sm text-destructive">
            Failed to load rows: {(rowsQuery.error as Error).message}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No rows.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="border-b border-border px-3 py-2 text-left font-mono font-medium"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                >
                  {columns.map((col) => {
                    const display = formatCell(row[col]);
                    return (
                      <td
                        key={col}
                        className="max-w-[20rem] truncate px-3 py-1.5 align-top"
                        title={display}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>
    </>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
