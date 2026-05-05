import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Loader2,
  Rocket,
  RotateCw,
  Triangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  deploymentKeys,
  deploymentsListOptions,
  integrationKeys,
  vercelIntegrationOptions,
} from "@/api";
import { useConversationDeploy } from "@/stores/deploy";
import { cn } from "@/lib/utils";

interface PublishPopoverProps {
  conversationId: string;
}

export function PublishPopover({ conversationId }: PublishPopoverProps) {
  const queryClient = useQueryClient();
  const { data: integration, isLoading: integrationLoading } = useQuery(vercelIntegrationOptions());
  const { data: deployments } = useQuery(deploymentsListOptions(conversationId));
  const deploy = useConversationDeploy(conversationId);

  const lastSuccess = deployments?.find((d) => d.status === "live") ?? null;
  const liveUrl = deploy.deployment?.publicUrl ?? lastSuccess?.publicUrl ?? null;
  const isAuthError = deploy.error?.code === "not_connected" || deploy.error?.code === "token_invalid";

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("integration-callback");
    } catch {
      return;
    }
    ch.onmessage = (event) => {
      const { integration: provider, status } = event.data ?? {};
      if (provider !== "vercel") return;
      void queryClient.invalidateQueries({ queryKey: integrationKeys.vercel() });
      if (status === "connected") {
        // After re-auth, drop any stale auth-related error so user can retry.
        if (deploy.error?.code === "not_connected" || deploy.error?.code === "token_invalid") {
          deploy.reset();
        }
      }
    };
    return () => {
      ch?.close();
    };
  }, [queryClient, deploy]);

  const refetchListOnDone = () => {
    void queryClient.invalidateQueries({ queryKey: deploymentKeys.list(conversationId) });
  };

  const handleConnect = () => {
    const url = "/api/integration/vercel/connect";
    const popup = window.open(url, "vercel-oauth", "popup,width=900,height=800");
    if (!popup) window.location.href = url;
  };

  const handleDeploy = () => {
    deploy.start(refetchListOnDone);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Rocket className="h-3.5 w-3.5" />
          {deploy.state === "running" ? (
            <span className="flex items-center gap-1.5">
              Publishing
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          ) : (
            <span>Publish</span>
          )}
          {liveUrl && deploy.state !== "running" && (
            <span aria-hidden className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        {integrationLoading ? (
          <LoadingShell />
        ) : !integration?.connected ? (
          <ConnectShell title="Connect Vercel to publish" onConnect={handleConnect} />
        ) : isAuthError ? (
          <ConnectShell
            title="Vercel authorization expired"
            subtitle={deploy.error!.message}
            onConnect={handleConnect}
            tone="error"
          />
        ) : deploy.state === "running" ? (
          <RunningShell status={deploy.status} message={deploy.message} />
        ) : deploy.state === "failed" ? (
          <FailedShell
            errorMessage={deploy.error?.message ?? "Deploy failed"}
            onRetry={handleDeploy}
            onClose={() => deploy.reset()}
          />
        ) : liveUrl ? (
          <DeployedShell url={liveUrl} onRedeploy={handleDeploy} />
        ) : (
          <FirstDeployShell onDeploy={handleDeploy} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <p className="text-sm font-semibold">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex h-32 items-center justify-center text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  );
}

function ConnectShell({
  title,
  subtitle,
  onConnect,
  tone = "neutral",
}: {
  title: string;
  subtitle?: string;
  onConnect: () => void;
  tone?: "neutral" | "error";
}) {
  return (
    <>
      <Header
        title={title}
        subtitle={subtitle ?? "Authorize your Vercel account so generated apps can be deployed under it."}
      />
      <div className="px-4 py-4">
        {tone === "error" && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Token revoked or integration uninstalled. Reconnect to continue.</span>
          </div>
        )}
        <Button className="w-full" onClick={onConnect}>
          <Triangle className="mr-1.5 h-3.5 w-3.5 fill-current" strokeWidth={0} />
          {tone === "error" ? "Reconnect Vercel" : "Connect Vercel"}
        </Button>
      </div>
    </>
  );
}

function FirstDeployShell({ onDeploy }: { onDeploy: () => void }) {
  return (
    <>
      <Header
        title="Deploy this app"
        subtitle="Publishes the current sandbox state as a production deployment under your Vercel account."
      />
      <div className="px-4 py-4">
        <Button className="w-full" onClick={onDeploy}>
          <Rocket className="mr-1.5 h-3.5 w-3.5" />
          Deploy
        </Button>
      </div>
    </>
  );
}

function RunningShell({
  status,
  message,
}: {
  status: string | null;
  message: string | null;
}) {
  const steps: { key: string; label: string }[] = [
    { key: "pending", label: "Preparing" },
    { key: "building", label: "Building" },
    { key: "uploading", label: "Deploying" },
    { key: "live", label: "Live" },
  ];
  const idx = steps.findIndex((s) => s.key === status);

  return (
    <>
      <Header title="Publishing…" subtitle={message ?? "Working…"} />
      <div className="px-4 py-4">
        <div className="flex flex-col gap-2">
          {steps.map((s, i) => {
            const done = idx > i;
            const active = idx === i;
            return (
              <div key={s.key} className="flex items-center gap-2 text-sm">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-border" />
                )}
                <span className={cn(active && "font-medium", !done && !active && "text-muted-foreground")}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DeployedShell({ url, onRedeploy }: { url: string; onRedeploy: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <Header title="Deployed" subtitle="Your app is live on Vercel." />
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="truncate text-sm">{url.replace(/^https?:\/\//, "")}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="mr-1 h-3 w-3" />
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" />
              Open
            </a>
          </Button>
          <Button size="sm" onClick={onRedeploy}>
            <RotateCw className="mr-1 h-3 w-3" />
            Re-deploy
          </Button>
        </div>
      </div>
    </>
  );
}

function FailedShell({
  errorMessage,
  onRetry,
  onClose,
}: {
  errorMessage: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <Header title="Deploy failed" />
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{errorMessage}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Dismiss
          </Button>
          <Button size="sm" onClick={onRetry}>
            <RotateCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      </div>
    </>
  );
}
