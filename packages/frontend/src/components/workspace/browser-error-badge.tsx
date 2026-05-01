import { useState } from "react";
import { AlertCircle, Sparkles, Trash2 } from "lucide-react";
import type { BrowserError } from "@code-artisan/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWorkspaceStore } from "@/stores/workspace";

const SOURCE_LABEL: Record<BrowserError["source"], string> = {
  "window.error": "Runtime",
  "unhandledrejection": "Promise",
  "console.error": "Console",
};

function formatErrorsForPrompt(errors: BrowserError[]): string {
  const header = `The browser preview reported ${errors.length} error${errors.length > 1 ? "s" : ""}. Please investigate the source files and fix them.`;
  const body = errors
    .map((err, index) => {
      const location =
        err.filename && err.line !== undefined
          ? `\n   at ${err.filename}:${err.line}${err.column !== undefined ? `:${err.column}` : ""}`
          : "";
      const stack = err.stack ? `\n   stack:\n${indent(err.stack, "     ")}` : "";
      return `${index + 1}. [${err.source}] ${err.message}${location}${stack}`;
    })
    .join("\n\n");
  return `${header}\n\n${body}`;
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

export function BrowserErrorBadge() {
  const errors = useWorkspaceStore((s) => s.browserErrors);
  const clearBrowserErrors = useWorkspaceStore((s) => s.clearBrowserErrors);
  const setPendingChatMessage = useWorkspaceStore((s) => s.setPendingChatMessage);
  const [open, setOpen] = useState(false);

  if (errors.length === 0) return null;

  const handleSendToAI = () => {
    setPendingChatMessage(formatErrorsForPrompt(errors));
    clearBrowserErrors();
    setOpen(false);
  };

  const handleClear = () => {
    clearBrowserErrors();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded p-0.5 text-destructive hover:opacity-80"
          title={`${errors.length} browser error${errors.length > 1 ? "s" : ""}`}
        >
          <AlertCircle className="h-3 w-3" />
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-destructive-foreground">
            {errors.length > 99 ? "99+" : errors.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium">
            {errors.length} browser error{errors.length > 1 ? "s" : ""}
          </span>
          <button
            onClick={handleClear}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Clear all"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {errors.map((err, index) => (
            <ErrorItem key={`${err.timestamp}-${index}`} error={err} />
          ))}
        </div>
        <div className="border-t border-border p-2">
          <Button size="sm" className="w-full gap-1.5" onClick={handleSendToAI}>
            <Sparkles className="h-3.5 w-3.5" />
            Ask AI to fix
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ErrorItem({ error }: { error: BrowserError }) {
  return (
    <div className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
          {SOURCE_LABEL[error.source]}
        </span>
        {error.filename && (
          <span className="truncate font-mono">
            {error.filename.split("/").pop()}
            {error.line !== undefined ? `:${error.line}` : ""}
          </span>
        )}
      </div>
      <div className="mt-1 break-words font-mono text-[11px] text-destructive">
        {error.message}
      </div>
    </div>
  );
}
