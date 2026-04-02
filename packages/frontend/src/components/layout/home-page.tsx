import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useConversationCreate, useSendMessage } from "@/lib/apis";

export function HomePage() {
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  const createConv = useConversationCreate();
  const sendMsg = useSendMessage();

  async function handleSubmit() {
    const content = input.trim();
    if (!content || createConv.isPending) return;

    const conv = await createConv.mutateAsync();
    await sendMsg.mutateAsync({ conversationId: conv.id, content });
    navigate({
      to: "/chat/$conversationId",
      params: { conversationId: conv.id },
      state: { initialMessage: content } as never,
    });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <h1 className="mb-8 text-3xl font-semibold text-foreground">
        What do you want to build?
      </h1>
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-border bg-card p-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Describe your project..."
            rows={3}
            className="w-full resize-none rounded-lg bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="text-xs text-muted-foreground">
              Shift+Enter for new line
            </div>
            <button
              onClick={handleSubmit}
              disabled={createConv.isPending || !input.trim()}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {createConv.isPending ? "Starting..." : "Start"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
