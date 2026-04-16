import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { API_BASE } from "@/lib/apis/client";

export const Route = createFileRoute("/test-stream")({
  component: TestStreamPage,
});

function TestStreamPage() {
  const [convId, setConvId] = useState("");
  const [content, setContent] = useState("你好");
  const [logs, setLogs] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function log(msg: string) {
    setLogs((prev) => [...prev, `[${new Date().toISOString().slice(11, 23)}] ${msg}`]);
  }

  async function handleCreateConv() {
    try {
      const res = await fetch(`${API_BASE}/conversation`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      log(`Created conversation: ${JSON.stringify(json)}`);
      if (json.data?.id) setConvId(json.data.id);
    } catch (err) {
      log(`Error creating conversation: ${err}`);
    }
  }

  async function handleSend() {
    if (!convId || streaming) return;
    setStreaming(true);
    log(`POST /api/message/${convId} with content: "${content}"`);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${API_BASE}/message/${convId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abort.signal,
      });

      log(`Response status: ${res.status} ${res.statusText}`);
      log(`Content-Type: ${res.headers.get("content-type")}`);

      if (!res.ok) {
        const text = await res.text();
        log(`Error body: ${text}`);
        setStreaming(false);
        return;
      }

      if (!res.body) {
        log("No response body!");
        setStreaming(false);
        return;
      }

      log("Reading stream...");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          log("Stream done.");
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        log(`Chunk (${chunk.length} bytes): ${chunk.slice(0, 200)}`);
        buffer += chunk;

        const parts = buffer.split("\n\n");
        buffer = parts.pop()!;

        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) {
              log("  [heartbeat]");
              continue;
            }
            eventCount++;
            try {
              const event = JSON.parse(data);
              log(`  Event #${eventCount} type=${event.type}: ${JSON.stringify(event).slice(0, 300)}`);
            } catch {
              log(`  Raw data: ${data.slice(0, 200)}`);
            }
          }
        }
      }

      log(`Stream complete. Total events: ${eventCount}`);
    } catch (err) {
      if (abort.signal.aborted) {
        log("Aborted by user.");
      } else {
        log(`Fetch error: ${err}`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 font-mono text-sm">
      <h1 className="text-lg font-bold">SSE Stream Test</h1>

      <div className="flex gap-2">
        <button onClick={handleCreateConv} className="rounded bg-blue-600 px-3 py-1 text-white">
          Create Conversation
        </button>
        <input
          value={convId}
          onChange={(e) => setConvId(e.target.value)}
          placeholder="conversation ID"
          className="flex-1 rounded border px-2 py-1 bg-card text-foreground"
        />
      </div>

      <div className="flex gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="message content"
          className="flex-1 rounded border px-2 py-1 bg-card text-foreground"
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={!convId || streaming}
          className="rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50"
        >
          Send
        </button>
        <button onClick={handleStop} className="rounded bg-red-600 px-3 py-1 text-white">
          Stop
        </button>
        <button onClick={() => setLogs([])} className="rounded bg-gray-600 px-3 py-1 text-white">
          Clear
        </button>
      </div>

      <pre className="h-[70vh] overflow-auto rounded border bg-black p-3 text-xs text-green-400 whitespace-pre-wrap">
        {logs.length === 0 ? "Logs will appear here..." : logs.join("\n")}
      </pre>
    </div>
  );
}
