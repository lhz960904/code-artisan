import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkle, Mail, ChevronRight } from "lucide-react";
import { signIn } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/",
  }),
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const [loading, setLoading] = useState(false);

  const handleGithub = async () => {
    setLoading(true);
    try {
      await signIn.social({ provider: "github", callbackURL: redirect || "/" });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card px-8 py-10 shadow-sm">
        <div className="mb-8 space-y-2 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sparkle className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Sign in to Code Artisan</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back! Please sign in to continue.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ProviderButton onClick={handleGithub} disabled={loading} icon={<GithubIcon className="h-4 w-4" />}>
            GitHub
          </ProviderButton>
          <ProviderButton disabled icon={<GoogleIcon className="h-4 w-4" />}>
            Google
          </ProviderButton>
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="email">
              Email address
            </label>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <input
                id="email"
                type="email"
                disabled
                placeholder="Enter your email address"
                className="h-10 w-full cursor-not-allowed rounded-md border border-border bg-muted/40 pl-9 pr-3 text-sm text-muted-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled
            className="flex h-10 w-full cursor-not-allowed items-center justify-center gap-1 rounded-md bg-primary/50 text-sm font-medium text-primary-foreground"
          >
            Continue
            <ChevronRight className="h-4 w-4" />
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          More providers coming soon.
        </p>
      </div>
    </div>
  );
}

function ProviderButton({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54v-1.9c-3.13.68-3.79-1.51-3.79-1.51-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.64 1.22 3.28.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.29-.5-1.44.11-3 0 0 .95-.3 3.11 1.16.9-.25 1.87-.37 2.83-.38.96.01 1.93.13 2.83.38 2.16-1.46 3.11-1.16 3.11-1.16.61 1.56.23 2.71.11 3 .72.79 1.16 1.8 1.16 3.03 0 4.33-2.64 5.28-5.15 5.56.4.35.76 1.04.76 2.1v3.11c0 .3.2.65.78.54 4.47-1.49 7.68-5.7 7.68-10.67C23.25 5.48 18.27.5 12 .5z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
