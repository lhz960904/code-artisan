import { ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";
import { SectionShell } from "./section-shell";

type Theme = "light" | "system" | "dark";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

export function PersonalGeneralSection() {
  const { theme, setTheme } = useTheme();
  const currentLabel = THEME_OPTIONS.find((option) => option.value === theme)?.label ?? "System";

  return (
    <SectionShell title="General Settings">
      <div className="flex flex-col gap-8">
        <SettingsGroup title="Appearance and notifications">
          <SettingRow
            label="Theme"
            description="Change the interface to light, dark or your default system preference."
          >
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 min-w-[140px] items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>{currentLabel}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {THEME_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => setTheme(option.value)}
                    className="flex items-center justify-between"
                  >
                    <span>{option.label}</span>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        theme === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SettingRow>
        </SettingsGroup>
      </div>
    </SectionShell>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-1 flex-col gap-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
