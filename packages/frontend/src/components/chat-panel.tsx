import { useState } from "react";
import { sendMessage } from "../lib/api";

interface Message {
  role: "user" | "agent";
  content: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const content = input.trim();
    if (!content || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setLoading(true);

    try {
      const result = await sendMessage(content);
      for (const event of result.events) {
        if (event.type === "ai_text") {
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: event.data.content as string },
          ]);
        } else if (event.type === "tool_result") {
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              content: `\`${event.data.tool}\`: ${event.data.output}`,
            },
          ]);
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "agent", content: `Error: ${err}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[600px] flex-col rounded-lg border border-[#30363d] bg-[#161b22]">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className="space-y-1">
              <div
                className={`text-xs font-semibold uppercase tracking-wide ${
                  msg.role === "agent" ? "text-[#58a6ff]" : "text-[#8b949e]"
                }`}
              >
                {msg.role === "agent" ? "Agent" : "You"}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#e6edf3]">
                {msg.content}
              </div>
            </div>
          ))}
          {loading && <div className="animate-pulse text-sm text-[#8b949e]">Thinking...</div>}
        </div>
      </div>
      <div className="border-t border-[#30363d] p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your task..."
            className="flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#484f58] outline-none focus:border-[#58a6ff]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-md bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
