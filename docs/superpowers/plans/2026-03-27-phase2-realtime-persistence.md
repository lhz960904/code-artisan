# Phase 2: Realtime & Persistence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the request-response model into a task-driven architecture: events persist to Supabase, frontend subscribes via Supabase Realtime, agent loop runs independently of frontend connection, conversations are persistent and resumable.

**Architecture:** Backend writes each event to Supabase as it occurs. Frontend subscribes to events table via Supabase Realtime for the active conversation. POST /messages returns immediately after starting the agent loop (fire-and-forget). Sandbox persists across messages in a conversation via sandbox_id stored in DB.

**Tech Stack:** Supabase JS Client (Realtime subscriptions), Drizzle ORM (event/conversation persistence), Hono.js (REST API), existing ClaudeService + SandboxService + AgentService

---

## File Structure

```
packages/
├── shared/src/
│   └── types.ts                        # Modify: add API types for conversations
├── backend/src/
│   ├── index.ts                        # Modify: mount new routes
│   ├── routes/
│   │   └── conversations.ts            # Rewrite: full CRUD + fire-and-forget /messages
│   ├── services/
│   │   ├── agent.ts                    # Modify: persist events to DB, manage sandbox lifecycle
│   │   ├── sandbox.ts                  # No changes
│   │   ├── claude.ts                   # No changes
│   │   └── event-store.ts             # Create: write/query events in Supabase
│   └── db/
│       ├── schema.ts                   # No changes
│       └── index.ts                    # No changes
└── frontend/src/
    ├── lib/
    │   ├── api.ts                      # Rewrite: conversation CRUD + send message
    │   └── supabase.ts                 # Create: Supabase client + Realtime subscription hook
    ├── routes/
    │   ├── index.tsx                   # Modify: conversation list page
    │   └── chat.$conversationId.tsx    # Create: main chat workspace route
    └── components/
        ├── chat-panel.tsx              # Rewrite: subscribe to Realtime events instead of request-response
        ├── home-page.tsx               # Modify: show conversation list
        ├── conversation-list.tsx       # Create: list of past conversations
        └── tool-call-card.tsx          # Create: collapsed tool call display component
```

---

## Task 1: Event Store Service

**Files:**
- Create: `packages/backend/src/services/event-store.ts`

- [ ] **Step 1: Create EventStore service**

```ts
// packages/backend/src/services/event-store.ts
import { db } from "../db/index.js";
import { events, conversations, fileSnapshots } from "../db/schema.js";
import { eq, and, gt } from "drizzle-orm";
import type { AgentEventData } from "./agent.js";

export class EventStore {
  constructor(private conversationId: string) {}

  async writeEvent(type: string, data: AgentEventData): Promise<void> {
    await db.insert(events).values({
      conversationId: this.conversationId,
      type,
      data: data as Record<string, unknown>,
    });
  }

  async getEvents(afterSeq?: number): Promise<
    Array<{
      id: string;
      seq: number;
      type: string;
      data: unknown;
      createdAt: Date;
    }>
  > {
    const conditions = [eq(events.conversationId, this.conversationId)];
    if (afterSeq !== undefined) {
      conditions.push(gt(events.seq, afterSeq));
    }

    return db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(events.seq);
  }

  async upsertFileSnapshot(path: string, content: string): Promise<void> {
    await db
      .insert(fileSnapshots)
      .values({
        conversationId: this.conversationId,
        path,
        content,
      })
      .onConflictDoUpdate({
        target: [fileSnapshots.conversationId, fileSnapshots.path],
        set: { content, updatedAt: new Date() },
      });
  }

  async getFileSnapshots(): Promise<Array<{ path: string; content: string }>> {
    return db
      .select({ path: fileSnapshots.path, content: fileSnapshots.content })
      .from(fileSnapshots)
      .where(eq(fileSnapshots.conversationId, this.conversationId));
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/backend && npx tsc --noEmit src/services/event-store.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/event-store.ts
git commit -m "feat: add EventStore service for persisting events and file snapshots"
```

---

## Task 2: Refactor AgentService for Persistence

**Files:**
- Modify: `packages/backend/src/services/agent.ts`

- [ ] **Step 1: Update AgentService to accept EventStore and manage sandbox lifecycle**

Replace the entire `packages/backend/src/services/agent.ts`:

```ts
// packages/backend/src/services/agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeService } from "./claude.js";
import { SandboxService } from "./sandbox.js";
import { EventStore } from "./event-store.js";
import { db } from "../db/index.js";
import { conversations, events } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { ToolCallData, ToolResultData } from "@web-ai-coding-agent/shared";

export type AgentEventData =
  | ToolCallData
  | ToolResultData
  | { content: string };

interface AgentRunOptions {
  conversationId: string;
  userMessage: string;
  maxIterations?: number;
}

export class AgentService {
  private claude: ClaudeService;

  constructor() {
    this.claude = new ClaudeService();
  }

  async run(options: AgentRunOptions): Promise<void> {
    const { conversationId, userMessage, maxIterations = 10 } = options;
    const store = new EventStore(conversationId);

    // Write user message event
    await store.writeEvent("user_message", { content: userMessage });

    // Get or create sandbox
    const sandbox = await this.getOrCreateSandbox(conversationId, store);

    try {
      // Build message history from existing events
      const history = await this.buildMessageHistory(store);

      for (let i = 0; i < maxIterations; i++) {
        const response = await this.claude.chat(history);

        if (response.type === "text") {
          await store.writeEvent("ai_text", { content: response.content });
          break;
        }

        // Handle tool call
        if (response.textContent) {
          await store.writeEvent("ai_text", { content: response.textContent });
        }

        const toolCallData: ToolCallData = {
          tool: response.toolName,
          args: response.toolInput,
        };
        await store.writeEvent("tool_call", toolCallData);

        // Execute tool
        const toolResult = await this.executeTool(
          sandbox,
          response.toolName,
          response.toolInput,
        );
        await store.writeEvent("tool_result", toolResult);

        // If write_file, persist snapshot
        if (response.toolName === "write_file") {
          await store.upsertFileSnapshot(
            response.toolInput.path,
            response.toolInput.content,
          );
        }

        // Add to history for next iteration
        history.push({
          role: "assistant",
          content: [
            ...(response.textContent
              ? [{ type: "text" as const, text: response.textContent }]
              : []),
            {
              type: "tool_use" as const,
              id: response.toolCallId,
              name: response.toolName,
              input: response.toolInput,
            },
          ],
        });

        history.push({
          role: "user",
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: response.toolCallId,
              content: toolResult.error
                ? `Error: ${toolResult.error}\nOutput: ${toolResult.output}`
                : toolResult.output,
            },
          ],
        });
      }
    } catch (err) {
      await store.writeEvent("error", {
        content: String(err),
      });
    }
  }

  private async getOrCreateSandbox(
    conversationId: string,
    store: EventStore,
  ): Promise<SandboxService> {
    // Check if conversation has an active sandbox
    const [conv] = await db
      .select({ sandboxId: conversations.sandboxId })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (conv?.sandboxId) {
      try {
        return await SandboxService.reconnect(conv.sandboxId);
      } catch {
        // Sandbox expired, create new one
      }
    }

    // Create new sandbox and restore files
    const sandbox = await SandboxService.create();
    const snapshots = await store.getFileSnapshots();
    if (snapshots.length > 0) {
      await sandbox.restoreFiles(snapshots);
    }

    // Store sandbox ID
    await db
      .update(conversations)
      .set({ sandboxId: sandbox.id })
      .where(eq(conversations.id, conversationId));

    return sandbox;
  }

  private async buildMessageHistory(
    store: EventStore,
  ): Promise<Anthropic.MessageParam[]> {
    const allEvents = await store.getEvents();
    const messages: Anthropic.MessageParam[] = [];

    for (const event of allEvents) {
      const data = event.data as Record<string, unknown>;

      switch (event.type) {
        case "user_message":
          messages.push({ role: "user", content: data.content as string });
          break;
        case "ai_text": {
          // Merge consecutive ai_text into assistant messages
          const last = messages[messages.length - 1];
          if (last?.role === "assistant" && typeof last.content === "string") {
            last.content += "\n" + (data.content as string);
          } else {
            messages.push({
              role: "assistant",
              content: data.content as string,
            });
          }
          break;
        }
        case "tool_call": {
          const toolData = data as unknown as ToolCallData;
          // tool_call always starts or extends an assistant turn
          const lastMsg = messages[messages.length - 1];
          const toolUseBlock = {
            type: "tool_use" as const,
            id: `tool_${event.seq}`,
            name: toolData.tool,
            input: toolData.args,
          };

          if (lastMsg?.role === "assistant" && Array.isArray(lastMsg.content)) {
            lastMsg.content.push(toolUseBlock);
          } else {
            messages.push({
              role: "assistant",
              content: [toolUseBlock],
            });
          }
          break;
        }
        case "tool_result": {
          const resultData = data as unknown as ToolResultData;
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: `tool_${event.seq - 1}`,
                content: resultData.error
                  ? `Error: ${resultData.error}\nOutput: ${resultData.output}`
                  : resultData.output,
              },
            ],
          });
          break;
        }
      }
    }

    return messages;
  }

  private async executeTool(
    sandbox: SandboxService,
    tool: string,
    args: Record<string, string>,
  ): Promise<ToolResultData> {
    try {
      switch (tool) {
        case "read_file": {
          const content = await sandbox.readFile(args.path);
          return { tool, output: content };
        }
        case "write_file": {
          await sandbox.writeFile(args.path, args.content);
          return { tool, output: `File written to ${args.path}` };
        }
        case "execute_command": {
          const result = await sandbox.executeCommand(args.command);
          return { tool, output: result.output, error: result.error };
        }
        case "list_files": {
          const files = await sandbox.listFiles(args.path);
          return { tool, output: files.join("\n") };
        }
        default:
          return { tool, output: "", error: `Unknown tool: ${tool}` };
      }
    } catch (err) {
      return { tool, output: "", error: String(err) };
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/agent.ts
git commit -m "refactor: AgentService now persists events to DB and manages sandbox lifecycle"
```

---

## Task 3: Conversations API — Full CRUD

**Files:**
- Rewrite: `packages/backend/src/routes/conversations.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Rewrite conversations route with full CRUD**

```ts
// packages/backend/src/routes/conversations.ts
import { Hono } from "hono";
import { db } from "../db/index.js";
import { conversations, events } from "../db/schema.js";
import { eq, desc, gt, and } from "drizzle-orm";
import { AgentService } from "../services/agent.js";

const conversationsRouter = new Hono();

// Create conversation
conversationsRouter.post("/", async (c) => {
  const { title } = await c.req.json<{ title?: string }>();

  const [conv] = await db
    .insert(conversations)
    .values({
      userId: "00000000-0000-0000-0000-000000000000", // Phase 2: no auth, placeholder
      title: title || null,
    })
    .returning();

  return c.json(conv, 201);
});

// List conversations
conversationsRouter.get("/", async (c) => {
  const result = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));

  return c.json(result);
});

// Get conversation detail
conversationsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Not found" }, 404);
  return c.json(conv);
});

// Update conversation (title, mode)
conversationsRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const updates = await c.req.json<{ title?: string; mode?: string }>();

  const [conv] = await db
    .update(conversations)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();

  if (!conv) return c.json({ error: "Not found" }, 404);
  return c.json(conv);
});

// Get events for conversation (with optional afterSeq for catchup)
conversationsRouter.get("/:id/events", async (c) => {
  const id = c.req.param("id");
  const afterSeq = c.req.query("afterSeq");

  const conditions = [eq(events.conversationId, id)];
  if (afterSeq) {
    conditions.push(gt(events.seq, Number(afterSeq)));
  }

  const result = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(events.seq);

  return c.json(result);
});

// Send message — fire-and-forget, agent runs in background
conversationsRouter.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const { content } = await c.req.json<{ content: string }>();

  if (!content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  // Verify conversation exists
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  // Fire-and-forget: start agent loop in background
  const agent = new AgentService();
  agent.run({ conversationId: id, userMessage: content }).catch((err) => {
    console.error(`Agent error for conversation ${id}:`, err);
  });

  // Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id));

  return c.json({ status: "started" });
});

export { conversationsRouter };
```

- [ ] **Step 2: Update index.ts to use new router name**

```ts
// packages/backend/src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { conversationsRouter } from "./routes/conversations.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/conversations", conversationsRouter);

console.log(`Backend running on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
```

- [ ] **Step 3: Test with curl**

```bash
# Create conversation
curl -X POST http://localhost:3001/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "Test"}'

# Send message (use the returned conversation ID)
curl -X POST http://localhost:3001/api/conversations/<id>/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Write hello world in Python"}'

# Poll events (wait a few seconds for agent to complete)
curl http://localhost:3001/api/conversations/<id>/events
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/conversations.ts packages/backend/src/index.ts
git commit -m "feat: full conversation CRUD with fire-and-forget agent execution"
```

---

## Task 4: Frontend Supabase Client + Realtime Hook

**Files:**
- Create: `packages/frontend/src/lib/supabase.ts`

- [ ] **Step 1: Create Supabase client and Realtime subscription hook**

```tsx
// packages/frontend/src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState, useCallback } from "react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface RealtimeEvent {
  id: string;
  conversation_id: string;
  seq: number;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
}

export function useConversationEvents(conversationId: string | null) {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const lastSeqRef = useRef(0);

  // Fetch existing events on mount or conversationId change
  const fetchEvents = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("conversation_id", conversationId)
      .gt("seq", lastSeqRef.current)
      .order("seq", { ascending: true });

    if (!error && data && data.length > 0) {
      setEvents((prev) => [...prev, ...data]);
      lastSeqRef.current = data[data.length - 1].seq;
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    // Reset state for new conversation
    setEvents([]);
    lastSeqRef.current = 0;

    // Fetch existing events
    fetchEvents();

    // Subscribe to new events via Realtime
    const channel = supabase
      .channel(`events:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newEvent = payload.new as RealtimeEvent;
          setEvents((prev) => {
            // Avoid duplicates
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            return [...prev, newEvent];
          });
          lastSeqRef.current = Math.max(
            lastSeqRef.current,
            newEvent.seq,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchEvents]);

  return { events, loading };
}
```

- [ ] **Step 2: Add env vars for frontend**

Create `packages/frontend/.env.example`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_API_BASE=http://localhost:3001
```

Add to root `.env` (same values as backend):
```
VITE_SUPABASE_URL=... (same as SUPABASE_URL)
VITE_SUPABASE_PUBLISHABLE_KEY=... (same as SUPABASE_PUBLISHABLE_KEY)
```

Note: Vite requires `VITE_` prefix for client-side env vars.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/supabase.ts packages/frontend/.env.example
git commit -m "feat: add Supabase client with Realtime subscription hook"
```

---

## Task 5: Rewrite Frontend API Client

**Files:**
- Rewrite: `packages/frontend/src/lib/api.ts`

- [ ] **Step 1: Full conversation CRUD API client**

```ts
// packages/frontend/src/lib/api.ts
const API_BASE = "/api";

export interface ConversationResponse {
  id: string;
  user_id: string;
  title: string | null;
  mode: string;
  sandbox_id: string | null;
  deploy_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function createConversation(
  title?: string,
): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function listConversations(): Promise<ConversationResponse[]> {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getConversation(
  id: string,
): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<{ status: string }> {
  const res = await fetch(
    `${API_BASE}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function updateConversation(
  id: string,
  updates: { title?: string; mode?: string },
): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/lib/api.ts
git commit -m "feat: rewrite API client with full conversation CRUD"
```

---

## Task 6: Tool Call Card Component

**Files:**
- Create: `packages/frontend/src/components/tool-call-card.tsx`

- [ ] **Step 1: Create ToolCallCard component**

```tsx
// packages/frontend/src/components/tool-call-card.tsx
import type { RealtimeEvent } from "../lib/supabase";

interface ToolCallCardProps {
  event: RealtimeEvent;
  result?: RealtimeEvent;
}

const TOOL_ICONS: Record<string, { icon: string; color: string }> = {
  write_file: { icon: "W", color: "text-[#58a6ff] bg-[#58a6ff]/15" },
  read_file: { icon: "R", color: "text-[#d29922] bg-[#d29922]/15" },
  execute_command: { icon: "$", color: "text-[#3fb950] bg-[#3fb950]/15" },
  list_files: { icon: "L", color: "text-[#bc8cff] bg-[#bc8cff]/15" },
};

export function ToolCallCard({ event, result }: ToolCallCardProps) {
  const data = event.data as { tool: string; args: Record<string, string> };
  const toolInfo = TOOL_ICONS[data.tool] ?? {
    icon: "?",
    color: "text-[#8b949e] bg-[#8b949e]/15",
  };
  const isDone = !!result;
  const hasError = result && (result.data as { error?: string }).error;

  let label = data.tool;
  if (data.tool === "write_file") label = `write ${data.args.path}`;
  else if (data.tool === "read_file") label = `read ${data.args.path}`;
  else if (data.tool === "execute_command") label = data.args.command;
  else if (data.tool === "list_files") label = `ls ${data.args.path}`;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#1c2128] px-3 py-2 font-mono text-xs">
      <div
        className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${toolInfo.color}`}
      >
        {toolInfo.icon}
      </div>
      <span className="truncate text-[#e6edf3]">{label}</span>
      <div className="ml-auto">
        {isDone ? (
          <div
            className={`h-1.5 w-1.5 rounded-full ${hasError ? "bg-[#f85149]" : "bg-[#3fb950]"}`}
          />
        ) : (
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d29922]" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/tool-call-card.tsx
git commit -m "feat: add ToolCallCard component for collapsed tool call display"
```

---

## Task 7: Rewrite ChatPanel with Realtime

**Files:**
- Rewrite: `packages/frontend/src/components/chat-panel.tsx`

- [ ] **Step 1: Rewrite ChatPanel to use Realtime subscription**

```tsx
// packages/frontend/src/components/chat-panel.tsx
import { useState, useRef, useEffect } from "react";
import { sendMessage } from "../lib/api";
import { useConversationEvents, type RealtimeEvent } from "../lib/supabase";
import { ToolCallCard } from "./tool-call-card";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const { events } = useConversationEvents(conversationId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Check if agent is currently processing (last event is not ai_text or error)
  const isAgentRunning =
    events.length > 0 &&
    !["ai_text", "error"].includes(events[events.length - 1].type) &&
    events.some((e) => e.type === "user_message");

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);

    try {
      await sendMessage(conversationId, content);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }

  // Pair tool_call events with their tool_result
  function getToolResult(
    toolCallEvent: RealtimeEvent,
  ): RealtimeEvent | undefined {
    const idx = events.indexOf(toolCallEvent);
    for (let i = idx + 1; i < events.length; i++) {
      if (events[i].type === "tool_result") return events[i];
      if (events[i].type === "tool_call") break; // Next tool call, no result found
    }
    return undefined;
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {events.map((event) => {
            switch (event.type) {
              case "user_message":
                return (
                  <div key={event.id} className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
                      You
                    </div>
                    <div className="text-sm leading-relaxed text-[#e6edf3]">
                      {(event.data as { content: string }).content}
                    </div>
                  </div>
                );
              case "ai_text":
                return (
                  <div key={event.id} className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#58a6ff]">
                      Agent
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#e6edf3]">
                      {(event.data as { content: string }).content}
                    </div>
                  </div>
                );
              case "tool_call":
                return (
                  <ToolCallCard
                    key={event.id}
                    event={event}
                    result={getToolResult(event)}
                  />
                );
              case "error":
                return (
                  <div
                    key={event.id}
                    className="rounded-md border border-[#f85149]/30 bg-[#f85149]/10 p-3 text-sm text-[#f85149]"
                  >
                    Error: {(event.data as { content: string }).content}
                  </div>
                );
              default:
                return null; // tool_result rendered inside ToolCallCard
            }
          })}
          {isAgentRunning && (
            <div className="animate-pulse text-sm text-[#8b949e]">
              Agent is working...
            </div>
          )}
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
            disabled={isAgentRunning}
            className="flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#484f58] outline-none focus:border-[#58a6ff] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || isAgentRunning || !input.trim()}
            className="rounded-md bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/chat-panel.tsx
git commit -m "refactor: ChatPanel now uses Supabase Realtime for live event updates"
```

---

## Task 8: Conversation List + Chat Route

**Files:**
- Create: `packages/frontend/src/components/conversation-list.tsx`
- Create: `packages/frontend/src/routes/chat.$conversationId.tsx`
- Modify: `packages/frontend/src/components/home-page.tsx`
- Modify: `packages/frontend/src/routes/index.tsx`

- [ ] **Step 1: Create ConversationList component**

```tsx
// packages/frontend/src/components/conversation-list.tsx
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { listConversations, createConversation, type ConversationResponse } from "../lib/api";

export function ConversationList() {
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleNew() {
    const conv = await createConversation();
    setConversations((prev) => [conv, ...prev]);
  }

  if (loading) {
    return <div className="text-sm text-[#8b949e]">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleNew}
        className="w-full rounded-md border border-dashed border-[#30363d] py-3 text-sm text-[#8b949e] hover:border-[#58a6ff] hover:text-[#58a6ff]"
      >
        + New Conversation
      </button>
      {conversations.map((conv) => (
        <Link
          key={conv.id}
          to="/chat/$conversationId"
          params={{ conversationId: conv.id }}
          className="block rounded-md border border-[#30363d] bg-[#161b22] p-3 hover:border-[#58a6ff]"
        >
          <div className="text-sm font-medium text-[#e6edf3]">
            {conv.title || "Untitled"}
          </div>
          <div className="mt-1 text-xs text-[#8b949e]">
            {new Date(conv.updated_at).toLocaleString()}
          </div>
        </Link>
      ))}
      {conversations.length === 0 && (
        <div className="text-center text-sm text-[#484f58]">
          No conversations yet. Start one!
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create chat route**

```tsx
// packages/frontend/src/routes/chat.$conversationId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "../components/chat-panel";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/chat/$conversationId")({
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-2">
        <Link to="/" className="text-sm text-[#8b949e] hover:text-[#58a6ff]">
          ← Back
        </Link>
        <span className="font-mono text-xs text-[#484f58]">
          {conversationId.slice(0, 8)}
        </span>
      </div>
      <ChatPanel conversationId={conversationId} />
    </div>
  );
}
```

- [ ] **Step 3: Update home page**

```tsx
// packages/frontend/src/components/home-page.tsx
import { ConversationList } from "./conversation-list";

export function HomePage() {
  return (
    <div className="flex h-full items-start justify-center pt-16">
      <div className="w-full max-w-lg p-4">
        <h1 className="mb-8 text-center text-2xl font-semibold text-[#58a6ff]">
          Web AI Coding Agent
        </h1>
        <ConversationList />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/conversation-list.tsx \
  packages/frontend/src/routes/chat.\$conversationId.tsx \
  packages/frontend/src/components/home-page.tsx
git commit -m "feat: add conversation list page and chat route with Realtime"
```

---

## Task 9: Supabase Realtime Setup — Enable Replication

**Files:** None (Supabase dashboard configuration)

- [ ] **Step 1: Enable Realtime for events table**

In Supabase dashboard → Database → Replication:
1. Enable replication for the `events` table
2. This allows `postgres_changes` subscriptions to work

Alternatively via SQL in Supabase SQL Editor:

```sql
-- Enable Realtime for events table
ALTER PUBLICATION supabase_realtime ADD TABLE events;
```

- [ ] **Step 2: Verify with frontend**

1. Start backend: `pnpm dev:backend`
2. Start frontend: `pnpm dev:frontend`
3. Open `http://localhost:5173`
4. Click "+ New Conversation"
5. Navigate to the new conversation
6. Send a message
7. Events should appear in real-time as the agent processes

- [ ] **Step 3: Commit any env changes**

```bash
git add .env.example
git commit -m "docs: add VITE_ env vars to .env.example for frontend Supabase"
```

---

## Verification Checklist

Phase 2 is complete when:
- [ ] Creating a conversation persists to Supabase
- [ ] Sending a message triggers agent loop in background
- [ ] Events appear in real-time via Supabase Realtime (no page refresh)
- [ ] Refreshing the page restores conversation history from DB
- [ ] Tool calls display as collapsed cards with status indicators
- [ ] Multiple messages in same conversation reuse sandbox
- [ ] File snapshots persist across sandbox restarts
- [ ] Error events display properly in chat
