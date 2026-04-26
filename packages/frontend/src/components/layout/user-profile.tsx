import { useSession } from "@/lib/auth-client";
import { AccountMenu } from "@/components/account/account-menu";

function getInitials(name?: string | null, email?: string | null) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function UserProfile() {
  const { data } = useSession();

  if (!data?.user) return null;
  const { name, email, image } = data.user;

  return (
    <div className="border-t border-border p-2">
      <AccountMenu
        contentProps={{ side: "top", align: "start", className: "w-56" }}
        trigger={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {image ? (
              <img
                src={image}
                alt={name || email || ""}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {getInitials(name, email)}
              </div>
            )}
            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
              <div className="truncate text-sm font-medium">{name || email}</div>
              <span className="inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Free
              </span>
            </div>
          </button>
        }
      />
    </div>
  );
}
