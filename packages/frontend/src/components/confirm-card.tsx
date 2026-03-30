import { useState } from "react";
import { confirmAction } from "../lib/api";
import type { ToolCallPart } from "@code-artisan/shared";

interface ConfirmCardProps {
  part: ToolCallPart;
  conversationId: string;
}

export function ConfirmCard({ part, conversationId }: ConfirmCardProps) {
  const [loading, setLoading] = useState(false);
  const [responded, setResponded] = useState(false);

  const description = `${part.toolName}(${JSON.stringify(part.input)})`;

  async function handleConfirm(approved: boolean) {
    setLoading(true);
    try {
      await confirmAction(conversationId, approved);
      setResponded(true);
    } catch (err) {
      console.error("Confirm error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (responded || part.approval !== "pending") {
    const wasApproved = part.approval === "approved" || responded;
    return (
      <div className="rounded-lg border border-[#d29922]/30 bg-[#d29922]/10 p-3">
        <div className={`text-xs font-medium ${wasApproved ? "text-[#3fb950]" : "text-[#f85149]"}`}>
          {wasApproved ? "Approved" : "Rejected"}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#d29922]/30 bg-[#d29922]/10 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#d29922]">
        Confirm Action
      </div>
      <div className="mb-2 font-mono text-xs text-[#e6edf3]">
        {description}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => handleConfirm(true)}
          disabled={loading}
          className="rounded-md bg-[#238636] px-3 py-1 text-xs font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => handleConfirm(false)}
          disabled={loading}
          className="rounded-md border border-[#f85149] px-3 py-1 text-xs font-medium text-[#f85149] hover:bg-[#f85149]/10 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
