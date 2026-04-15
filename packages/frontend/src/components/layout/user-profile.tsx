import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";

function getInitials(name?: string | null, email?: string | null) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function UserProfile() {
  const { data } = useSession();
  const navigate = useNavigate();

  if (!data?.user) return null;
  const { name, email, image } = data.user;

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="group flex items-center gap-2 border-t border-border px-3 py-3">
      {image ? (
        <img
          src={image}
          alt={name || email || ""}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
          {getInitials(name, email)}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <div className="truncate text-sm font-medium">{name || email}</div>
        <div className="truncate text-xs text-muted-foreground">免费版</div>
      </div>
      <button
        onClick={handleSignOut}
        title="Sign out"
        className="hidden shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground group-hover:block"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
