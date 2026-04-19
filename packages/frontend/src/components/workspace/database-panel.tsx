import { Database } from "lucide-react";

export function DatabasePanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Database className="h-10 w-10 opacity-30" />
      <p className="text-sm">Database coming soon</p>
    </div>
  );
}
