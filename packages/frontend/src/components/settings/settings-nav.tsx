import { Settings, FileText, Plug, Cable } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SettingsSection } from "@/stores/settings";

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: "project" | "personal";
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "project",
    label: "Project Settings",
    items: [
      { id: "general", label: "General", icon: Settings },
      { id: "system-prompt", label: "System Prompt", icon: FileText },
    ],
  },
  {
    id: "personal",
    label: "Personal Settings",
    items: [
      { id: "personal-general", label: "General", icon: Settings },
      { id: "integrations", label: "Integrations", icon: Cable },
      { id: "mcp-servers", label: "MCP Servers", icon: Plug },
    ],
  },
];

interface SettingsNavProps {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  showProject: boolean;
}

export function SettingsNav({ active, onSelect, showProject }: SettingsNavProps) {
  const groups = showProject ? NAV_GROUPS : NAV_GROUPS.filter((g) => g.id !== "project");

  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto border-r border-border bg-muted/30 px-3 py-6">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <div className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.label}
          </div>
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
