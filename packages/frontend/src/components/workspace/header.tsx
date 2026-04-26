import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Eye, Code2, Database, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/common/logo";
import { conversationDetailOptions, quotaOptions } from "@/api";
import { useSession } from "@/lib/auth-client";
import { useWorkspaceStore } from "@/stores/workspace";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/account/account-menu";

interface HeaderProps {
  conversationId: string;
}

export function Header({ conversationId }: HeaderProps) {
  const { data: conversation } = useSuspenseQuery(conversationDetailOptions(conversationId));
  const { data: quota } = useSuspenseQuery(quotaOptions());

  return (
    <HeaderShell>
      <HeaderBrand title={conversation.title || "Untitled"} />
      <ViewSwitcher />
      <div className="flex items-center gap-3">
        <TokenBalance remaining={quota.remaining} />
        <UserAvatar conversationId={conversationId} />
      </div>
    </HeaderShell>
  );
}

export function HeaderSkeleton() {
  return (
    <HeaderShell>
      <HeaderBrand>
        <Skeleton className="h-4 w-32" />
      </HeaderBrand>
      <ViewSwitcher />
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-7 rounded-full" />
      </div>
    </HeaderShell>
  );
}

function HeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      {children}
    </header>
  );
}

function ViewSwitcher() {
  const view = useWorkspaceStore((s) => s.view);
  const setView = useWorkspaceStore((s) => s.setView);
  const views = ["preview", "code", "database"] as const;
  const activeIndex = Math.max(views.indexOf(view), 0);

  return (
    <div
      className="absolute top-1/2 grid -translate-y-1/2 grid-cols-3 items-center rounded-md border border-border bg-background p-0.5"
      style={{ left: "calc(var(--chat-panel-width, 28%))" }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 w-[calc((100%-4px)/3)] rounded-[5px] bg-muted transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      <SwitcherBtn active={view === "preview"} onClick={() => setView("preview")} title="Preview">
        <Eye />
      </SwitcherBtn>
      <SwitcherBtn active={view === "code"} onClick={() => setView("code")} title="Code">
        <Code2 />
      </SwitcherBtn>
      <SwitcherBtn active={view === "database"} onClick={() => setView("database")} title="Database">
        <Database />
      </SwitcherBtn>
    </div>
  );
}

function SwitcherBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "relative z-10 h-7 w-8 px-0 transition-colors hover:bg-transparent cursor-pointer",
        disabled && "cursor-not-allowed opacity-40",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      tabIndex={disabled ? -1 : 0}
      type="button"
    >
      {children}
    </Button>
  );
}

function HeaderBrand({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Link to="/" className="flex items-center gap-1.5 hover:opacity-80">
        <Logo className="size-5" />
        <span className="text-sm font-bold tracking-tight">CodeArtisan</span>
      </Link>
      <span className="text-muted-foreground">/</span>
      {title !== undefined ? (
        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{title}</span>
      ) : (
        children
      )}
    </div>
  );
}

function TokenBalance({ remaining }: { remaining: number }) {
  return (
    <Button asChild title={`${remaining.toLocaleString()} tokens remaining · 点击升级`} variant="outline" size="sm">
      <Link to="/pricing">
        <Coins className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="tabular-nums">{formatTokens(remaining)}</span>
      </Link>
    </Button>
  );
}

function formatTokens(n: number) {
  const symbol = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${symbol}${(n / 1_000).toFixed(1)}K`;
  return `${symbol}${String(n)}`;
}

function UserAvatar({ conversationId }: { conversationId: string }) {
  const { data } = useSession();
  const user = data?.user;

  if (!user) return <Skeleton className="h-7 w-7 rounded-full" />;

  const label = user.name || user.email || "";

  return (
    <AccountMenu
      conversationId={conversationId}
      contentProps={{ align: "end", className: "w-52" }}
      trigger={
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 overflow-hidden rounded-full outline-none ring-offset-background transition-shadow hover:ring-2 hover:ring-ring hover:ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {user.image ? (
            <img src={user.image} alt={label} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-[10px] font-medium text-primary">
              {getInitials(user.name, user.email)}
            </div>
          )}
        </button>
      }
    />
  );
}

function getInitials(name?: string | null, email?: string | null) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
