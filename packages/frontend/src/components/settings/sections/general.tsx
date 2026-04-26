import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { conversationDetailOptions } from "@/api";
import { useConversationUpdate } from "@/api/mutations/conversations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionShell } from "./section-shell";

interface GeneralSectionProps {
  conversationId: string;
}

export function GeneralSection({ conversationId }: GeneralSectionProps) {
  const { data: conversation } = useSuspenseQuery(conversationDetailOptions(conversationId));
  const update = useConversationUpdate();

  const savedName = conversation.title ?? "";
  const [name, setName] = useState(savedName);

  const trimmed = name.trim();
  const dirty = trimmed !== savedName;
  const canSave = dirty && trimmed.length > 0 && !update.isPending;

  function handleSave() {
    if (!canSave) return;
    update.mutate({ id: conversationId, title: trimmed });
  }

  return (
    <SectionShell title="General">
      <div className="flex max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label htmlFor="settings-project-name" className="text-sm font-medium">
            Project name
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="settings-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Untitled"
            />
            <Button onClick={handleSave} disabled={!canSave}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
