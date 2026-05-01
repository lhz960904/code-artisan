import { MousePointerClick, X } from "lucide-react";
import type { SelectedElement } from "@code-artisan/shared";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace";

interface SelectedElementChipProps {
  className?: string;
}

function pickPreviewText(element: SelectedElement): string {
  if (element.textContent) return element.textContent;
  return element.selector;
}

export function SelectedElementChip({ className }: SelectedElementChipProps) {
  const selectedElement = useWorkspaceStore((s) => s.selectedElement);
  const setSelectedElement = useWorkspaceStore((s) => s.setSelectedElement);

  if (!selectedElement) return null;

  const preview = pickPreviewText(selectedElement);
  const tooltip = `<${selectedElement.tagName}> ${selectedElement.selector}`;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <div
        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs"
        title={tooltip}
      >
        <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="shrink-0 font-mono font-semibold text-primary">
          &lt;{selectedElement.tagName}&gt;
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {preview}
        </span>
        <button
          onClick={() => setSelectedElement(null)}
          className="shrink-0 cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Remove selected element"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
