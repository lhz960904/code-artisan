import { Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Eye, Code2, Database, Coins, LogOut, Moon, Sun, Monitor, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/common/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { conversationDetailOptions, quotaOptions } from "@/api";
import { useSession, signOut } from "@/lib/auth-client";
import { useTheme } from "@/contexts/theme-context";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSettingsStore } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings";

interface HeaderProps {
  conversationId: string;
}

export function Header({ conversationId }: HeaderProps) {
  const { data: conversation } = useSuspenseQuery(conversationDetailOptions(conversationId));
  const { data: quota } = useSuspenseQuery(quotaOptions());

  return (
    <>
      <HeaderShell>
        <HeaderBrand title={conversation.title || "Untitled"} />
        <ViewSwitcher />
        <div className="flex items-center gap-3">
          <TokenBalance remaining={quota.remaining} />
          <UserAvatar />
        </div>
      </HeaderShell>
      <SettingsDialog conversationId={conversationId} />
    </>
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
    <Button type="button" title={`${remaining.toLocaleString()} tokens remaining`} variant="outline" size="sm">
      <Coins className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="tabular-nums">{formatTokens(remaining)}</span>
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

function UserAvatar() {
  const { data } = useSession();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const openSettings = useSettingsStore((s) => s.openSettings);
  const user = data?.user;

  if (!user) return <Skeleton className="h-7 w-7 rounded-full" />;

  const label = user.name || user.email || "";

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login", search: { redirect: "/" } });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="flex items-center justify-between px-2 py-1.5 text-sm">
          <span className="text-muted-foreground">Theme</span>
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
            <ThemeBtn active={theme === "light"} onClick={() => setTheme("light")} title="Light">
              <Sun className="h-3.5 w-3.5" />
            </ThemeBtn>
            <ThemeBtn active={theme === "system"} onClick={() => setTheme("system")} title="System">
              <Monitor className="h-3.5 w-3.5" />
            </ThemeBtn>
            <ThemeBtn active={theme === "dark"} onClick={() => setTheme("dark")} title="Dark">
              <Moon className="h-3.5 w-3.5" />
            </ThemeBtn>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openSettings()}>
          <SettingsIcon className="mr-2 h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} variant="destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function getInitials(name?: string | null, email?: string | null) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
