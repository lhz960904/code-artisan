import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { conversationDetailOptions } from "@/api";
import { useConversationUpdate } from "@/api/mutations/conversations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionShell } from "./section-shell";

interface SystemPromptSectionProps {
  conversationId: string;
}

export function SystemPromptSection({ conversationId }: SystemPromptSectionProps) {
  const { data: conversation } = useSuspenseQuery(conversationDetailOptions(conversationId));
  const update = useConversationUpdate();

  const savedPrompt = conversation.settings?.systemPrompt ?? "";
  const [prompt, setPrompt] = useState(savedPrompt);

  const dirty = prompt !== savedPrompt;
  const canSave = dirty && !update.isPending;

  function handleSave() {
    if (!canSave) return;
    update.mutate({ id: conversationId, settings: { systemPrompt: prompt } });
  }

  return (
    <SectionShell title="System Prompt">
      <div className="flex flex-col gap-3">
        <label htmlFor="settings-system-prompt" className="text-sm font-medium">
          Custom instructions
        </label>
        <Textarea
          id="settings-system-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="e.g. Always respond in Chinese. Prefer functional components. Use Tailwind v4 conventions…"
          className="min-h-[320px] font-mono text-sm"
        />
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!canSave}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
