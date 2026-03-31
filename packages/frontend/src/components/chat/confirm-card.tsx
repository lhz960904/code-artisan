import { useState } from "react";
import { useConfirmAction } from "@/lib/apis";
import type { ToolCallPart } from "@code-artisan/shared";

interface ConfirmCardProps {
  part: ToolCallPart;
  conversationId: string;
}

export function ConfirmCard({ part, conversationId }: ConfirmCardProps) {
  const [responded, setResponded] = useState(false);
  const confirm = useConfirmAction();

  const description = `${part.toolName}(${JSON.stringify(part.input)})`;

  function handleConfirm(approved: boolean) {
    confirm.mutate(
      { conversationId, approved },
      { onSuccess: () => setResponded(true) },
    );
  }

  if (responded || part.approval !== "pending") {
    const wasApproved = part.approval === "approved" || responded;
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
        <div className={`text-xs font-medium ${wasApproved ? "text-success" : "text-destructive"}`}>
          {wasApproved ? "Approved" : "Rejected"}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">
        Confirm Action
      </div>
      <div className="mb-2 font-mono text-xs text-foreground">
        {description}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => handleConfirm(true)}
          disabled={confirm.isPending}
          className="rounded-md bg-success px-3 py-1 text-xs font-medium text-success-foreground hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => handleConfirm(false)}
          disabled={confirm.isPending}
          className="rounded-md border border-destructive px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
