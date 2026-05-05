import { useEffect, useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rootRoute } from "@/pages/layout/root";

export const oauthReturnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/return",
  validateSearch: (search: Record<string, unknown>) => ({
    integration: typeof search.integration === "string" ? search.integration : "",
    status: typeof search.status === "string" ? search.status : "",
  }),
  component: OAuthReturnPage,
});

const BROADCAST_CHANNEL = "integration-callback";

const COPY: Record<
  string,
  { tone: "success" | "error"; title: string; subtitle: string }
> = {
  connected: {
    tone: "success",
    title: "Connected",
    subtitle: "You can close this window and return to Code Artisan.",
  },
  denied: {
    tone: "error",
    title: "Authorization denied",
    subtitle: "You declined the request on the provider's side.",
  },
  "missing-code": {
    tone: "error",
    title: "Missing authorization code",
    subtitle: "The provider did not send back an authorization code.",
  },
  "invalid-state": {
    tone: "error",
    title: "Invalid state",
    subtitle: "Authorization state mismatch — please try connecting again.",
  },
  "not-configured": {
    tone: "error",
    title: "Not configured",
    subtitle: "OAuth credentials are missing on the server.",
  },
  error: {
    tone: "error",
    title: "Something went wrong",
    subtitle: "An unexpected error occurred during the callback.",
  },
};

function OAuthReturnPage() {
  const { integration, status } = oauthReturnRoute.useSearch();
  const copy = COPY[status] ?? COPY.error;
  const [closeFailed, setCloseFailed] = useState(false);

  useEffect(() => {
    if (!integration || !status) return;
    try {
      const ch = new BroadcastChannel(BROADCAST_CHANNEL);
      ch.postMessage({ integration, status });
      ch.close();
    } catch {
      // BroadcastChannel may be unavailable in private mode / old browsers.
    }
    const closeTimer = setTimeout(() => window.close(), 600);
    const fallbackTimer = setTimeout(() => setCloseFailed(true), 1500);
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(fallbackTimer);
    };
  }, [integration, status]);

  const Icon = copy.tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-sm">
        <div
          className={
            "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full " +
            (copy.tone === "success"
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-destructive/10 text-destructive")
          }
        >
          <Icon className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
        {closeFailed && (
          <Button className="mt-6 w-full" onClick={() => window.close()}>
            Close window
          </Button>
        )}
      </div>
    </div>
  );
}
