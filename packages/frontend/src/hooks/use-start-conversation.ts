import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useConversationCreate } from "@/api";
import { getSession } from "@/lib/auth-client";
import { usePendingPromptStore } from "@/stores/pending-prompt";
import type { Attachment } from "@code-artisan/shared";

export function useStartConversation() {
  const navigate = useNavigate();
  const createConversation = useConversationCreate();
  const setDraft = usePendingPromptStore((s) => s.setDraft);
  const setForConversation = usePendingPromptStore((s) => s.setForConversation);
  const [busy, setBusy] = useState(false);

  async function start(prompt: string, attachments: Attachment[] = []) {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await getSession();
      if (!data?.session) {
        setDraft({ prompt, attachments });
        await navigate({ to: "/login", search: { redirect: "/dashboard" } });
        return;
      }
      const conversation = await createConversation.mutateAsync();
      if (prompt || attachments.length > 0) {
        setForConversation(conversation.id, { prompt, attachments });
      }
      await navigate({
        to: "/chat/$conversationId",
        params: { conversationId: conversation.id },
      });
    } finally {
      setBusy(false);
    }
  }

  return { start, busy };
}
