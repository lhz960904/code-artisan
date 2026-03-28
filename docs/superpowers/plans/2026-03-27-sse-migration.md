# SSE Migration: Replace Supabase Realtime with Server-Sent Events

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Realtime (postgres_changes) with SSE for all real-time event delivery, eliminating DB round-trip latency for streaming text while keeping DB as the persistence layer for conversation history.

**Architecture:** An in-memory EventBus handles per-conversation pub/sub. The Agent emits events to EventBus AND writes to DB. A new SSE endpoint (`GET /conversations/:id/stream`) subscribes to EventBus and forwards events to the frontend. For streaming AI text, the Agent emits `ai_text_delta` events via SSE only (no DB writes per chunk), then writes one final `ai_text` event to DB when complete. Frontend loads history from REST API on page load, then connects to SSE for live updates.

**Tech Stack:** Hono `streamSSE()`, Node.js EventEmitter, existing REST API + Drizzle ORM

---

## File Structure

```
packages/
├── backend/src/
│   ├── services/
│   │   ├── event-bus.ts               # Create: in-memory pub/sub per conversation
│   │   ├── agent.ts                    # Modify: emit events to EventBus, stream text as deltas
│   │   ├── event-store.ts             # Modify: writeEvent returns full event (id + seq)
│   │   └── claude.ts                   # No changes
│   ├── routes/
│   │   └── conversations.ts           # Modify: add SSE stream endpoint
│   └── index.ts                        # No changes
└── frontend/src/
    ├── lib/
    │   ├── supabase.ts                 # Modify: remove Realtime subscription, keep client for DB queries
    │   └── event-source.ts            # Create: SSE hook (useConversationStream)
    └── components/
        └── chat-panel.tsx             # Modify: use new hook, handle ai_text_delta
```

---

### Task 1: Create EventBus

**Files:**
- Create: `packages/backend/src/services/event-bus.ts`

- [ ] **Step 1: Implement EventBus**

Create `packages/backend/src/services/event-bus.ts`:

```typescript
import { EventEmitter } from "events";

export interface SSEEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  seq?: number;
}

class ConversationEventBus {
  private emitters = new Map<string, EventEmitter>();

  private getEmitter(conversationId: string): EventEmitter {
    if (!this.emitters.has(conversationId)) {
      const emitter = new EventEmitter();
      emitter.setMaxListeners(20);
      this.emitters.set(conversationId, emitter);
    }
    return this.emitters.get(conversationId)!;
  }

  emit(conversationId: string, event: SSEEvent): void {
    this.getEmitter(conversationId).emit("event", event);
  }

  subscribe(
    conversationId: string,
    handler: (event: SSEEvent) => void,
  ): () => void {
    const emitter = this.getEmitter(conversationId);
    emitter.on("event", handler);
    return () => {
      emitter.off("event", handler);
      if (emitter.listenerCount("event") === 0) {
        this.emitters.delete(conversationId);
      }
    };
  }

  /** Signal that agent is done — clients can use this to know streaming ended */
  emitDone(conversationId: string): void {
    this.emit(conversationId, { id: "done", type: "done", data: {} });
  }
}

export const eventBus = new ConversationEventBus();
```

- [ ] **Step 2: Verify compiles**

```bash
cd packages/backend && npx tsc --noEmit
```

---

### Task 2: Add SSE stream endpoint

**Files:**
- Modify: `packages/backend/src/routes/conversations.ts`

- [ ] **Step 1: Add SSE endpoint**

Add import at the top of `conversations.ts`:

```typescript
import { streamSSE } from "hono/streaming";
import { eventBus } from "../services/event-bus.js";
```

Add the SSE endpoint after the existing `GET /:id/files` route:

```typescript
// SSE stream — real-time events for a conversation
conversationsRouter.get("/:id/stream", (c) => {
  const id = c.req.param("id");

  return streamSSE(c, async (stream) => {
    const unsub = eventBus.subscribe(id, async (event) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
          id: event.id,
        });
      } catch {
        // Client disconnected
      }
    });

    // Keep connection open until client disconnects
    stream.onAbort(() => {
      unsub();
    });

    // Send a heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: "", event: "heartbeat", id: "hb" });
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // Block until abort
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat);
        resolve();
      });
    });
  });
});
```

- [ ] **Step 2: Verify compiles**

```bash
cd packages/backend && npx tsc --noEmit
```

---

### Task 3: Update EventStore to return full event data

**Files:**
- Modify: `packages/backend/src/services/event-store.ts`

- [ ] **Step 1: Change writeEvent to return id and seq**

Update `writeEvent` in `event-store.ts`:

```typescript
async writeEvent(
  type: string,
  data: AgentEventData,
): Promise<{ id: string; seq: number }> {
  const [row] = await db
    .insert(events)
    .values({
      conversationId: this.conversationId,
      type,
      data: data as Record<string, unknown>,
    })
    .returning({ id: events.id, seq: events.seq });
  return row;
}
```

This is a signature change — callers that used the return value as `string` need updating (agent.ts used `const aiTextEventId = await store.writeEvent(...)`).

---

### Task 4: Update Agent to emit events via EventBus

**Files:**
- Modify: `packages/backend/src/services/agent.ts`

This is the core change. The agent must:
1. Emit all events to EventBus for SSE delivery
2. For streaming text: emit `ai_text_delta` (SSE only, no DB), then write final `ai_text` to DB + emit
3. For all other events: write to DB + emit

- [ ] **Step 1: Add EventBus import and helper**

Add to imports in `agent.ts`:

```typescript
import { eventBus, type SSEEvent } from "./event-bus.js";
```

Add a helper method to `AgentService`:

```typescript
/** Write event to DB and emit to SSE */
private async emitAndPersist(
  store: EventStore,
  conversationId: string,
  type: string,
  data: AgentEventData,
): Promise<{ id: string; seq: number }> {
  const row = await store.writeEvent(type, data);
  eventBus.emit(conversationId, {
    id: row.id,
    type,
    data: data as Record<string, unknown>,
    seq: row.seq,
  });
  return row;
}
```

- [ ] **Step 2: Replace all store.writeEvent calls**

In the `run()` method, replace every `await store.writeEvent(...)` with `await this.emitAndPersist(store, conversationId, ...)`.

For user_message:
```typescript
await this.emitAndPersist(store, conversationId, "user_message", { content: userMessage });
```

For error:
```typescript
await this.emitAndPersist(store, conversationId, "error", { content: "Token quota exceeded." });
```

For tool_call:
```typescript
await this.emitAndPersist(store, conversationId, "tool_call", toolCallData);
```

For tool_result:
```typescript
await this.emitAndPersist(store, conversationId, "tool_result", toolResult);
```

For confirm_required:
```typescript
await this.emitAndPersist(store, conversationId, "confirm_required", confirmData);
```

For preview_url:
```typescript
await this.emitAndPersist(store, conversationId, "preview_url", { url, port });
```

- [ ] **Step 3: Replace streaming text logic**

Replace the current streaming block:

```typescript
// Create placeholder ai_text event for streaming
const aiTextEventId = await store.writeEvent("ai_text", { content: "" });
let lastUpdate = 0;

const response = await this.claude.chatStream(history, (text) => {
  const now = Date.now();
  if (now - lastUpdate > 200) {
    lastUpdate = now;
    store.updateEvent(aiTextEventId, { content: text });
  }
});

if (response.type === "text") {
  await store.updateEvent(aiTextEventId, { content: response.content });
  // ...
} else {
  // ...
  if (response.textContent) {
    await store.updateEvent(aiTextEventId, { content: response.textContent });
  } else {
    await db.delete(eventsTable).where(eq(eventsTable.id, aiTextEventId));
  }
}
```

With the new SSE-based approach:

```typescript
// Stream text via SSE only (no DB writes per chunk)
const streamId = `stream_${Date.now()}`;

const response = await this.claude.chatStream(history, (text) => {
  eventBus.emit(conversationId, {
    id: streamId,
    type: "ai_text_delta",
    data: { content: text },
  });
});

if (response.type === "text") {
  // Write final text to DB and emit
  await this.emitAndPersist(store, conversationId, "ai_text", { content: response.content });
  await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);
  break;
}

await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);

if (response.textContent) {
  await this.emitAndPersist(store, conversationId, "ai_text", { content: response.textContent });
}
// No need to delete empty placeholder — we never created one
```

- [ ] **Step 4: Emit done when agent finishes**

At the end of `run()`, after the try/catch:

```typescript
} catch (err) {
  await this.emitAndPersist(store, conversationId, "error", { content: String(err) });
}

eventBus.emitDone(conversationId);
```

- [ ] **Step 5: Update handlePendingConfirm to use emitAndPersist**

Replace `store.writeEvent(...)` calls inside `handlePendingConfirm` with `this.emitAndPersist(store, conversationId, ...)`. The method needs `conversationId` as a parameter:

```typescript
private async handlePendingConfirm(
  store: EventStore,
  sandbox: SandboxService,
  conversationId: string,
): Promise<boolean> {
```

Update the caller in `run()` to pass `conversationId`:

```typescript
const pendingHandled = await this.handlePendingConfirm(store, sandbox, conversationId);
```

- [ ] **Step 6: Remove unused imports**

Remove `events as eventsTable` import from schema since we no longer delete placeholder events. Also remove `updateEvent` usage.

- [ ] **Step 7: Verify compiles**

```bash
cd packages/backend && npx tsc --noEmit
```

---

### Task 5: Create frontend SSE hook

**Files:**
- Create: `packages/frontend/src/lib/event-source.ts`

- [ ] **Step 1: Implement useConversationStream hook**

Create `packages/frontend/src/lib/event-source.ts`:

```typescript
import { useEffect, useRef, useState, useCallback } from "react";

const API_BASE = "/api";

export interface StreamEvent {
  id: string;
  conversation_id?: string;
  seq?: number;
  type: string;
  data: Record<string, unknown>;
}

export function useConversationStream(conversationId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Fetch existing events from REST API
  const fetchHistory = useCallback(async (convId: string) => {
    const res = await fetch(`${API_BASE}/conversations/${convId}/events`);
    if (!res.ok) return;
    const data: StreamEvent[] = await res.json();
    setEvents(data);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    // 1. Load history
    fetchHistory(conversationId);

    // 2. Connect SSE
    const es = new EventSource(
      `${API_BASE}/conversations/${conversationId}/stream`,
    );
    esRef.current = es;

    // Handle all event types
    const handleEvent = (e: MessageEvent) => {
      if (cancelled) return;
      try {
        const event: { id: string; type: string; data: Record<string, unknown>; seq?: number } =
          JSON.parse(e.data);

        if (event.type === "ai_text_delta") {
          // Streaming text — update in place, don't add to events
          setStreamingText((event.data as { content: string }).content);
          return;
        }

        // Persisted event — add to events list
        setStreamingText(null); // clear streaming text when final event arrives
        setEvents((prev) => {
          if (prev.some((ev) => ev.id === event.id)) {
            // Update existing event
            return prev.map((ev) => (ev.id === event.id ? { ...ev, ...event } : ev));
          }
          return [...prev, event as StreamEvent];
        });
      } catch {
        // ignore parse errors
      }
    };

    // Listen for all event types
    for (const type of [
      "user_message",
      "ai_text",
      "ai_text_delta",
      "tool_call",
      "tool_result",
      "confirm_required",
      "confirm_response",
      "preview_url",
      "error",
      "done",
    ]) {
      es.addEventListener(type, handleEvent);
    }

    es.onerror = () => {
      // EventSource auto-reconnects; on reconnect, re-fetch history
      if (!cancelled) {
        fetchHistory(conversationId);
      }
    };

    return () => {
      cancelled = true;
      es.close();
      esRef.current = null;
      setEvents([]);
      setStreamingText(null);
      setReady(false);
    };
  }, [conversationId, fetchHistory]);

  return { events, streamingText, ready };
}
```

---

### Task 6: Update ChatPanel to use SSE hook

**Files:**
- Modify: `packages/frontend/src/components/chat-panel.tsx`

- [ ] **Step 1: Switch from Supabase hook to SSE hook**

Replace the import:
```typescript
// Remove:
import { useConversationEvents, type RealtimeEvent } from "../lib/supabase";
// Add:
import { useConversationStream, type StreamEvent } from "../lib/event-source";
```

Replace the hook usage:
```typescript
// Remove:
const { events } = useConversationEvents(conversationId);
// Add:
const { events, streamingText } = useConversationStream(conversationId);
```

Update all `RealtimeEvent` type references to `StreamEvent`.

- [ ] **Step 2: Render streaming text**

In the events rendering section, after the events map and before `isAgentRunning`, add streaming text display:

```typescript
{streamingText && (
  <div key="streaming" className="space-y-1">
    <div className="text-xs font-semibold uppercase tracking-wide text-[#58a6ff]">
      Agent
    </div>
    <div className="text-sm leading-relaxed text-[#e6edf3]">
      <MarkdownRenderer content={streamingText} />
    </div>
  </div>
)}
```

- [ ] **Step 3: Update isAgentRunning logic**

The agent running state can now also check for streaming text:

```typescript
const isAgentRunning =
  streamingText !== null ||
  (events.length > 0 &&
    !["ai_text", "error", "done"].includes(events[events.length - 1].type) &&
    events.some((e) => e.type === "user_message"));
```

- [ ] **Step 4: Update event type references**

Replace all `RealtimeEvent` with `StreamEvent` in:
- `getToolResult` function parameter and return type
- `ToolCallCard` and `ConfirmCard` props (check if they use `RealtimeEvent` type)

Check `tool-call-card.tsx` and `confirm-card.tsx` — if they import `RealtimeEvent` from supabase, update them to import `StreamEvent` from `event-source`.

---

### Task 7: Clean up Supabase Realtime

**Files:**
- Modify: `packages/frontend/src/lib/supabase.ts`
- Modify: `packages/frontend/src/components/tool-call-card.tsx`
- Modify: `packages/frontend/src/components/confirm-card.tsx`

- [ ] **Step 1: Simplify supabase.ts**

Remove the `useConversationEvents` hook and `RealtimeEvent` type. Keep only the Supabase client (needed for initial event fetch — or we can remove it entirely if we use REST API directly):

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.SUPABASE_URL as string;
const supabaseKey = import.meta.env.SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);
```

- [ ] **Step 2: Update tool-call-card.tsx and confirm-card.tsx**

Replace `RealtimeEvent` imports with `StreamEvent`:

In `tool-call-card.tsx`:
```typescript
import type { StreamEvent } from "../lib/event-source";

interface ToolCallCardProps {
  event: StreamEvent;
  result?: StreamEvent;
}
```

In `confirm-card.tsx`:
```typescript
import type { StreamEvent } from "../lib/event-source";

interface ConfirmCardProps {
  event: StreamEvent;
  conversationId: string;
  hasResponse: boolean;
  wasApproved?: boolean;
}
```

---

### Task 8: Verification

- [ ] **Step 1: Type check all packages**

```bash
cd packages/backend && npx tsc --noEmit
cd packages/frontend && npx tsc --noEmit
```

- [ ] **Step 2: Build frontend**

```bash
cd packages/frontend && pnpm build
```

- [ ] **Step 3: E2E test**

1. Start backend + frontend
2. Create a new chat
3. Send "Write a Python hello world and run it"
4. Verify:
   - AI text streams in progressively (no lag)
   - Tool call cards appear
   - File tree updates, editor opens file
   - Terminal shows command output
5. Refresh the page mid-conversation
6. Verify: all history loads from DB, SSE reconnects
7. Test confirm mode: toggle to confirm, send a message, approve/reject
