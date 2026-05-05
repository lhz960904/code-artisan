import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Triangle, Loader2 } from "lucide-react";
import {
  vercelIntegrationOptions,
  useDisconnectVercel,
  integrationKeys,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionShell } from "./section-shell";

const BROADCAST_CHANNEL = "integration-callback";

type FlashStatus =
  | "connected"
  | "denied"
  | "error"
  | "invalid-state"
  | "missing-code"
  | "not-configured";

export function IntegrationsSection() {
  const flash = useIntegrationCallbackBus();

  return (
    <SectionShell title="Integrations">
      <div className="flex flex-col gap-4">
        {flash && <ReturnFlash status={flash} />}
        <VercelIntegrationCard />
        <SupabaseIntegrationCard />
      </div>
    </SectionShell>
  );
}

function VercelIntegrationCard() {
  const { data, isLoading } = useQuery(vercelIntegrationOptions());
  const disconnect = useDisconnectVercel();

  const onConnect = () => {
    const url = "/api/integration/vercel/connect";
    const popup = window.open(url, "vercel-oauth", "popup,width=900,height=800");
    if (!popup) {
      window.location.href = url;
    }
  };

  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <Triangle className="h-5 w-5 fill-current" strokeWidth={0} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Vercel</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : data?.connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
              </Button>
            ) : (
              <Button size="sm" onClick={onConnect}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Connect Vercel
              </Button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Deploy generated apps to your own Vercel account. Each conversation gets its own
            project.
          </p>
          {data?.connected && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span className="truncate">
                Connected to{" "}
                <span className="font-medium text-foreground">
                  {data.user_name ?? "your Vercel account"}
                </span>
                {data.team_id && (
                  <span className="ml-1 text-xs text-muted-foreground">(team)</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SupabaseIntegrationCard() {
  return (
    <div className="rounded-lg border border-dashed border-border p-5 opacity-70">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
          <svg viewBox="0 0 109 113" className="h-5 w-5" fill="currentColor">
            <path d="M63.7 110.8c-2.9 3.6-8.7 1.6-8.7-3V69.1H29.2c-4.7 0-7.3-5.4-4.5-9L62.2 12.1c2.9-3.6 8.7-1.6 8.7 3v38.7H97c4.7 0 7.3 5.4 4.5 9l-37.8 48z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">
              Supabase <span className="ml-1 text-xs text-muted-foreground">· Coming soon</span>
            </h3>
            <Button size="sm" disabled>
              Connect Supabase
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorize your Supabase organization so Code Artisan can auto-provision databases per
            conversation.
          </p>
        </div>
      </div>
    </div>
  );
}

function useIntegrationCallbackBus(): FlashStatus | null {
  const [flash, setFlash] = useState<FlashStatus | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(BROADCAST_CHANNEL);
    } catch {
      return;
    }
    ch.onmessage = (event) => {
      const { integration, status } = event.data ?? {};
      if (integration !== "vercel" || typeof status !== "string") return;
      setFlash(status as FlashStatus);
      void queryClient.invalidateQueries({ queryKey: integrationKeys.vercel() });
    };
    return () => {
      ch?.close();
    };
  }, [queryClient]);

  return flash;
}

function ReturnFlash({ status }: { status: FlashStatus }) {
  const map: Record<FlashStatus, { tone: "success" | "error"; text: string }> = {
    connected: { tone: "success", text: "Vercel connected successfully." },
    denied: { tone: "error", text: "Authorization denied on Vercel." },
    "missing-code": { tone: "error", text: "Vercel did not return an authorization code." },
    "invalid-state": { tone: "error", text: "Authorization state mismatch — please try again." },
    "not-configured": { tone: "error", text: "Vercel OAuth is not configured on the server." },
    error: { tone: "error", text: "Something went wrong during Vercel callback." },
  };
  const flash = map[status];
  const isSuccess = flash.tone === "success";
  return (
    <div
      className={
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm " +
        (isSuccess
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-destructive/30 bg-destructive/10 text-destructive")
      }
    >
      {isSuccess ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <Loader2 className="h-4 w-4 shrink-0" />
      )}
      <span>{flash.text}</span>
    </div>
  );
}
