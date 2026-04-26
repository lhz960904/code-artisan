import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Logo } from "@/components/common/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession, signOut } from "@/lib/auth-client";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

function getInitials(name?: string | null, email?: string | null) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function HomeHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 flex h-14 items-center gap-6 px-6 transition-[background-color,box-shadow] duration-150",
        scrolled
          ? "bg-background/80 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]"
          : "bg-transparent",
      )}
    >
      <Link to="/" className="flex items-center gap-2 font-display text-base font-semibold">
        <Logo className="size-6" />
        <span>CodeArtisan</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <a
          href="https://github.com/lhz960904/code-artisan"
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="GitHub repository"
        >
          <GithubMark className="size-4" />
        </a>
        <ThemeToggle />
        <HeaderAuthSlot />
      </div>
    </nav>
  );
}

function HeaderAuthSlot() {
  const { data, isPending } = useSession();
  const navigate = useNavigate();
  const openSettings = useSettingsStore((s) => s.openSettings);

  if (isPending) return <div className="ml-1 size-6" aria-hidden />;

  if (!data?.user) {
    return (
      <Link
        to="/login"
        search={{ redirect: "/" }}
        className="ml-1 inline-flex h-8 items-center rounded-md bg-primary px-3 font-display text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Log in
      </Link>
    );
  }

  const { name, email, image } = data.user;

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login", search: { redirect: "/" } });
  }

  return (
    <>
      <Link
        to="/dashboard"
        className="ml-1 inline-flex h-8 items-center rounded-md px-3 font-display text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
      >
        Dashboard
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="ml-1 inline-flex size-6 items-center justify-center overflow-hidden rounded-full outline-none ring-offset-background transition-opacity hover:opacity-90"
        >
          {image ? (
            <img src={image} alt={name || email || ""} className="size-6 object-cover" />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {getInitials(name, email)}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{name || email}</span>
            {name && email && (
              <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openSettings()}>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54v-1.9c-3.13.68-3.79-1.51-3.79-1.51-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.64 1.22 3.28.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.29-.5-1.44.11-3 0 0 .95-.3 3.11 1.16.9-.25 1.87-.37 2.83-.38.96.01 1.93.13 2.83.38 2.16-1.46 3.11-1.16 3.11-1.16.61 1.56.23 2.71.11 3 .72.79 1.16 1.8 1.16 3.03 0 4.33-2.64 5.28-5.15 5.56.4.35.76 1.04.76 2.1v3.11c0 .3.2.65.78.54 4.47-1.49 7.68-5.7 7.68-10.67C23.25 5.48 18.27.5 12 .5z" />
    </svg>
  );
}
