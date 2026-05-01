import { MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace";

export function ElementPickerToggle() {
  const ready = useWorkspaceStore((s) => s.iframeRuntimeReady);
  const active = useWorkspaceStore((s) => s.pickModeActive);
  const send = useWorkspaceStore((s) => s.iframeBridgeSend);

  const disabled = !ready || !send;

  const toggle = () => {
    if (!send) return;
    send({ type: active ? "exit-pick-mode" : "enter-pick-mode" });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
      title={
        disabled
          ? "Preview runtime not loaded"
          : active
            ? "Cancel selection (Esc)"
            : "Select an element from the preview"
      }
    >
      <MousePointerClick className="h-4 w-4" />
      <span>Select</span>
    </button>
  );
}
