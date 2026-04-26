import type { ComponentProps, ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  LogOut,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { useSettingsStore } from "@/stores/settings";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  trigger: ReactNode;
  /** When set, Settings opens scoped to this conversation. Omit on non-project pages. */
  conversationId?: string;
  contentProps?: ComponentProps<typeof DropdownMenuContent>;
}

export function AccountMenu({ trigger, conversationId, contentProps }: AccountMenuProps) {
  const navigate = useNavigate();
  const openSettings = useSettingsStore((s) => s.openSettings);
  const { theme, setTheme } = useTheme();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login", search: { redirect: "/" } });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent {...contentProps}>
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
        <DropdownMenuItem asChild>
          <Link to="/pricing" className="cursor-pointer">
            <Sparkles className="mr-2 h-4 w-4 text-primary" /> 升级 Pro
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openSettings({ conversationId })}>
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
  children: ReactNode;
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
