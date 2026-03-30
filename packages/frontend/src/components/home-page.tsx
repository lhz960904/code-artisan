import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createConversation, sendMessage } from "../lib/api";

export function HomePage() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit() {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      const conv = await createConversation();
      // Navigate first so SSE connects before agent starts emitting events
      navigate({ to: "/chat/$conversationId", params: { conversationId: conv.id } });
      sendMessage(conv.id, content).catch(console.error);
    } catch (err) {
      console.error("Failed to start conversation:", err);
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <h1 className="mb-8 text-3xl font-semibold text-[#e6edf3]">
        What do you want to build?
      </h1>
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-1">
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
            className="w-full resize-none rounded-lg bg-transparent px-4 py-3 text-sm text-[#e6edf3] placeholder:text-[#484f58] outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="text-xs text-[#484f58]">
              Shift+Enter for new line
            </div>
            <button
              onClick={handleSubmit}
              disabled={sending || !input.trim()}
              className="rounded-md bg-[#238636] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
            >
              {sending ? "Starting..." : "Start"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
