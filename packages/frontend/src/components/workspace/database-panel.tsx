import { useEffect, useMemo, useState } from "react";
import {
  useIsFetching,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Database, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  conversationDetailOptions,
  databaseKeys,
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
  const queryClient = useQueryClient();
  const fetchingCount = useIsFetching({ queryKey: databaseKeys.all(conversationId) });
  const isRefreshing = fetchingCount > 0;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: databaseKeys.all(conversationId) });
  };

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
        <div className="flex h-9 items-center justify-between border-b border-border pl-3 pr-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Tables</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={refreshAll}
            disabled={isRefreshing}
            title="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
          </Button>
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

  // Memo on the keys signature so column refs only break when shape changes,
  // not when rows reload. Keeps width state stable across pagination.
  const columnKeysStr = rows.length > 0 ? Object.keys(rows[0]).join("|") : "";
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!columnKeysStr) return [];
    return columnKeysStr.split("|").map((key) => ({
      id: key,
      accessorKey: key,
      header: key,
    }));
  }, [columnKeysStr]);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  useEffect(() => {
    setColumnSizing({});
  }, [tableName]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    defaultColumn: { size: 200, minSize: 60, maxSize: 800 },
    getCoreRowModel: getCoreRowModel(),
  });

  const canPrev = offset > 0;
  // No COUNT(*) — too expensive on large tables. Page full → maybe more; short → end.
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
          <table
            className="text-xs"
            style={{ width: table.getTotalSize(), tableLayout: "fixed" }}
          >
            <TableHeader className="sticky top-0 z-10 bg-card">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className="relative h-8 px-3 font-mono text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none transition-colors",
                          header.column.getIsResizing()
                            ? "bg-primary"
                            : "bg-transparent hover:bg-border",
                        )}
                      />
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="font-mono">
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const display = formatCell(cell.getValue());
                    return (
                      <TableCell
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="truncate px-3 align-top"
                        title={display}
                      >
                        {display}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
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
