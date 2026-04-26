import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ExternalLink, Download, Trash2, Settings as SettingsIcon } from "lucide-react";
import type { McpEnvVar, McpServerListItem } from "@code-artisan/shared";
import {
  mcpServersListOptions,
  useInstallMcpServer,
  useUninstallMcpServer,
  useUpdateMcpServer,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SectionShell } from "./section-shell";

type Tab = "marketplace" | "installed";

export function McpServersSection() {
  const { data: servers = [], isLoading } = useQuery(mcpServersListOptions());
  const [tab, setTab] = useState<Tab>("marketplace");
  const [search, setSearch] = useState("");
  const [installTarget, setInstallTarget] = useState<McpServerListItem | null>(null);
  const [editTarget, setEditTarget] = useState<McpServerListItem | null>(null);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    let list = servers;
    if (keyword) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(keyword) ||
          s.description.toLowerCase().includes(keyword) ||
          s.tags.some((t) => t.toLowerCase().includes(keyword)),
      );
    }
    if (tab === "installed") list = list.filter((s) => s.installed);
    return list;
  }, [servers, search, tab]);

  return (
    <SectionShell title="MCP Servers">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4 border-b border-border">
          <TabButton active={tab === "marketplace"} onClick={() => setTab("marketplace")}>
            Marketplace
          </TabButton>
          <TabButton active={tab === "installed"} onClick={() => setTab("installed")}>
            Installed
          </TabButton>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search MCP servers…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <ServerListSkeleton />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tab === "installed" ? "No MCP servers installed yet." : "No servers match your search."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onInstall={() => setInstallTarget(server)}
                onEdit={() => setEditTarget(server)}
              />
            ))}
          </div>
        )}
      </div>

      {installTarget && (
        <InstallDialog server={installTarget} onClose={() => setInstallTarget(null)} />
      )}
      {editTarget && <EditDialog server={editTarget} onClose={() => setEditTarget(null)} />}
    </SectionShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ServerListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function ServerCard({
  server,
  onInstall,
  onEdit,
}: {
  server: McpServerListItem;
  onInstall: () => void;
  onEdit: () => void;
}) {
  const uninstall = useUninstallMcpServer();

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{server.name}</h3>
          <p className="text-xs text-muted-foreground">
            by {server.author} · {server.category}
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{server.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {server.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {server.tags.length > 4 && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                +{server.tags.length - 4}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={server.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Documentation"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          {server.installed ? (
            <>
              {server.envVars.length > 0 && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <SettingsIcon className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => uninstall.mutate(server.id)}
                disabled={uninstall.isPending}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Uninstall
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onInstall}>
              <Download className="mr-1 h-3.5 w-3.5" /> Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InstallDialog({
  server,
  onClose,
}: {
  server: McpServerListItem;
  onClose: () => void;
}) {
  const install = useInstallMcpServer();
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  const requiredVarsFilled = server.envVars
    .filter((v) => v.required)
    .every((v) => envVars[v.name]?.trim());
  const canInstall = (server.envVars.length === 0 || requiredVarsFilled) && !install.isPending;

  async function handleInstall() {
    if (!canInstall) return;
    await install.mutateAsync({ serverId: server.id, envVars });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{server.name}</DialogTitle>
          <DialogDescription>
            by {server.author} · {server.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <a
            href={server.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View documentation
          </a>

          {server.envVars.length > 0 && (
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold">Required parameters</h4>
              {server.envVars.map((envVar) => (
                <EnvVarInput
                  key={envVar.name}
                  envVar={envVar}
                  value={envVars[envVar.name] || ""}
                  onChange={(val) => setEnvVars((prev) => ({ ...prev, [envVar.name]: val }))}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleInstall} disabled={!canInstall}>
            <Download className="mr-1 h-3.5 w-3.5" />
            {install.isPending ? "Installing…" : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  server,
  onClose,
}: {
  server: McpServerListItem;
  onClose: () => void;
}) {
  const update = useUpdateMcpServer();
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  async function handleSave() {
    if (update.isPending) return;
    await update.mutateAsync({ serverId: server.id, envVars });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {server.name}</DialogTitle>
          <DialogDescription>Update configuration parameters.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {server.envVars.map((envVar) => (
            <EnvVarInput
              key={envVar.name}
              envVar={envVar}
              value={envVars[envVar.name] || ""}
              onChange={(val) => setEnvVars((prev) => ({ ...prev, [envVar.name]: val }))}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnvVarInput({
  envVar,
  value,
  onChange,
}: {
  envVar: McpEnvVar;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`mcp-env-${envVar.name}`} className="text-sm font-medium">
        {envVar.label}
        {envVar.required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <Input
        id={`mcp-env-${envVar.name}`}
        placeholder={envVar.placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">{envVar.description}</p>
    </div>
  );
}
