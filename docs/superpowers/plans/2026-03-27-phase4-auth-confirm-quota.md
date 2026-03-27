# Phase 4: Confirm Mode + Token Quota

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YOLO/Confirm execution mode toggle so users can approve or reject each tool call, and implement per-user token quota tracking to limit Claude API usage.

**Architecture:** In Confirm mode, the agent loop pauses after each tool_call by writing a `confirm_required` event, then polls the DB for a `confirm_response` event (written when user clicks Approve/Reject in the frontend). Token quota is checked before each Claude API call and updated after each response. Auth is deferred — the hardcoded user ID remains for now.

**Tech Stack:** Existing Drizzle ORM (user_quotas table already exists), Hono.js (new endpoints), Supabase Realtime (confirm events flow to frontend automatically)

---

## File Structure

```
packages/
├── shared/src/
│   └── types.ts                        # Modify: add ConfirmRequiredData, ConfirmResponseData
├── backend/src/
│   ├── services/
│   │   ├── agent.ts                    # Modify: add confirm mode pause/wait, token quota tracking
│   │   └── quota.ts                    # Create: quota check/update logic
│   └── routes/
│       └── conversations.ts            # Modify: add POST /:id/confirm, GET /quota endpoints
└── frontend/src/
    ├── lib/
    │   └── api.ts                      # Modify: add confirmAction(), getQuota()
    └── components/
        ├── confirm-card.tsx            # Create: Approve/Reject confirmation card
        ├── chat-panel.tsx              # Modify: render confirm_required events
        └── toolbar.tsx                 # Modify: add mode toggle button
```

---

### Task 1: Add shared types for confirm events

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add ConfirmRequiredData and ConfirmResponseData interfaces**

Add after the `ToolResultData` interface in `packages/shared/src/types.ts`:

```typescript
export interface ConfirmRequiredData {
  tool: string;
  args: Record<string, string>;
  description: string;
}

export interface ConfirmResponseData {
  approved: boolean;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd packages/shared && npx tsc --noEmit
```
Expected: No errors.

---

### Task 2: Create QuotaService

**Files:**
- Create: `packages/backend/src/services/quota.ts`

- [ ] **Step 1: Implement QuotaService**

Create `packages/backend/src/services/quota.ts`:

```typescript
import { db } from "../db/index.js";
import { userQuotas } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

const DEFAULT_TOTAL_TOKENS = 1_000_000;

export class QuotaService {
  constructor(private userId: string) {}

  async ensureQuotaExists(): Promise<void> {
    await db
      .insert(userQuotas)
      .values({
        userId: this.userId,
        totalTokens: DEFAULT_TOTAL_TOKENS,
        usedTokens: 0,
      })
      .onConflictDoNothing();
  }

  async getQuota(): Promise<{ totalTokens: number; usedTokens: number; remaining: number }> {
    await this.ensureQuotaExists();
    const [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, this.userId));

    return {
      totalTokens: quota.totalTokens,
      usedTokens: quota.usedTokens,
      remaining: quota.totalTokens - quota.usedTokens,
    };
  }

  async checkBalance(): Promise<boolean> {
    const { remaining } = await this.getQuota();
    return remaining > 0;
  }

  async addUsage(inputTokens: number, outputTokens: number): Promise<void> {
    const total = inputTokens + outputTokens;
    await db
      .update(userQuotas)
      .set({
        usedTokens: sql`${userQuotas.usedTokens} + ${total}`,
      })
      .where(eq(userQuotas.userId, this.userId));
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd packages/backend && npx tsc --noEmit
```
Expected: No errors.

---

### Task 3: Add confirm mode to agent loop

**Files:**
- Modify: `packages/backend/src/services/agent.ts`

- [ ] **Step 1: Add confirm wait logic and token quota to agent**

The agent needs to:
1. Read conversation `mode` before the loop
2. In confirm mode: write `confirm_required` event after `tool_call`, poll DB for `confirm_response`
3. Check token quota before each Claude API call
4. Track token usage after each Claude response

Update `packages/backend/src/services/agent.ts`:

Add imports at the top:
```typescript
import type { ConfirmRequiredData, ConfirmResponseData } from "@web-ai-coding-agent/shared";
import { QuotaService } from "./quota.js";
```

Add a helper method to the `AgentService` class:
```typescript
private async waitForConfirmation(
  store: EventStore,
  afterSeq: number,
  timeoutMs: number = 300_000, // 5 minutes
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const events = await store.getEvents(afterSeq);
    const confirmEvent = events.find((e) => e.type === "confirm_response");
    if (confirmEvent) {
      const data = confirmEvent.data as unknown as ConfirmResponseData;
      return data.approved;
    }
    await new Promise((r) => setTimeout(r, 1000)); // poll every 1s
  }
  return false; // timeout = reject
}
```

Modify the `run()` method. After the existing `await store.writeEvent("tool_call", toolCallData);` line, add confirm mode logic:

```typescript
// In confirm mode, pause and wait for user approval
const [convState] = await db
  .select({ mode: conversations.mode })
  .from(conversations)
  .where(eq(conversations.id, conversationId));

if (convState?.mode === "confirm") {
  const description = `${response.toolName}(${JSON.stringify(response.toolInput)})`;
  const confirmData: ConfirmRequiredData = {
    tool: response.toolName,
    args: response.toolInput,
    description,
  };
  await store.writeEvent("confirm_required", confirmData as unknown as Record<string, unknown>);

  // Get the seq of the confirm_required event we just wrote
  const allEvents = await store.getEvents();
  const lastSeq = allEvents[allEvents.length - 1]?.seq ?? 0;

  const approved = await this.waitForConfirmation(store, lastSeq);
  if (!approved) {
    // Write a "rejected" tool_result and tell Claude
    const rejectResult: ToolResultData = {
      tool: response.toolName,
      output: "User rejected this tool call.",
      error: "rejected",
    };
    await store.writeEvent("tool_result", rejectResult);

    history.push({
      role: "assistant",
      content: [
        ...(response.textContent ? [{ type: "text" as const, text: response.textContent }] : []),
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
          content: "User rejected this tool call.",
          is_error: true,
        },
      ],
    });
    continue; // next iteration
  }
}
```

Add token quota check at the start of each loop iteration (before `this.claude.chat()`):

```typescript
const quota = new QuotaService(userId);
const hasBalance = await quota.checkBalance();
if (!hasBalance) {
  await store.writeEvent("error", { content: "Token quota exceeded." });
  break;
}
```

After receiving a Claude response, track usage:

```typescript
if (response.type === "text") {
  await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);
  await store.writeEvent("ai_text", { content: response.content });
  break;
}

// For tool_use responses:
await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);
```

The `run()` method also needs the `userId`. Get it from the conversation record:

```typescript
const [convRecord] = await db
  .select({ userId: conversations.userId, mode: conversations.mode })
  .from(conversations)
  .where(eq(conversations.id, conversationId));

const userId = convRecord?.userId ?? "00000000-0000-0000-0000-000000000000";
```

- [ ] **Step 2: Verify backend compiles**

```bash
cd packages/backend && npx tsc --noEmit
```
Expected: No errors.

---

### Task 4: Add confirm and quota endpoints

**Files:**
- Modify: `packages/backend/src/routes/conversations.ts`

- [ ] **Step 1: Add POST /:id/confirm endpoint**

Add after the `GET /:id/files` handler in `packages/backend/src/routes/conversations.ts`:

```typescript
// User approves/rejects a confirm_required event
conversationsRouter.post("/:id/confirm", async (c) => {
  const id = c.req.param("id");
  const { approved } = await c.req.json<{ approved: boolean }>();

  // Verify conversation exists
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  // Write confirm_response event
  await db.insert(events).values({
    conversationId: id,
    type: "confirm_response",
    data: { approved },
  });

  return c.json({ status: "ok" });
});
```

- [ ] **Step 2: Add quota route**

Add a new route at the end of the file (before `export`):

```typescript
// Get user quota (hardcoded user for now)
conversationsRouter.get("/user/quota", async (c) => {
  const userId = "00000000-0000-0000-0000-000000000000";

  const [quota] = await db
    .select()
    .from(userQuotas)
    .where(eq(userQuotas.userId, userId));

  if (!quota) {
    return c.json({ totalTokens: 1000000, usedTokens: 0, remaining: 1000000 });
  }

  return c.json({
    totalTokens: quota.totalTokens,
    usedTokens: quota.usedTokens,
    remaining: quota.totalTokens - quota.usedTokens,
  });
});
```

Add `userQuotas` to the imports from schema:

```typescript
import { conversations, events, fileSnapshots, userQuotas } from "../db/schema.js";
```

- [ ] **Step 3: Verify backend compiles**

```bash
cd packages/backend && npx tsc --noEmit
```
Expected: No errors.

---

### Task 5: Add frontend API functions

**Files:**
- Modify: `packages/frontend/src/lib/api.ts`

- [ ] **Step 1: Add confirmAction and getQuota functions**

Add at the end of `packages/frontend/src/lib/api.ts`:

```typescript
export async function confirmAction(
  conversationId: string,
  approved: boolean,
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface QuotaResponse {
  totalTokens: number;
  usedTokens: number;
  remaining: number;
}

export async function getQuota(): Promise<QuotaResponse> {
  const res = await fetch(`${API_BASE}/conversations/user/quota`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

---

### Task 6: Create ConfirmCard component

**Files:**
- Create: `packages/frontend/src/components/confirm-card.tsx`

- [ ] **Step 1: Implement ConfirmCard**

Create `packages/frontend/src/components/confirm-card.tsx`:

```typescript
import { useState } from "react";
import { confirmAction } from "../lib/api";
import type { RealtimeEvent } from "../lib/supabase";

interface ConfirmCardProps {
  event: RealtimeEvent;
  conversationId: string;
  hasResponse: boolean;
  wasApproved?: boolean;
}

export function ConfirmCard({ event, conversationId, hasResponse, wasApproved }: ConfirmCardProps) {
  const [loading, setLoading] = useState(false);
  const data = event.data as { tool: string; args: Record<string, string>; description: string };

  async function handleConfirm(approved: boolean) {
    setLoading(true);
    try {
      await confirmAction(conversationId, approved);
    } catch (err) {
      console.error("Confirm error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#d29922]/30 bg-[#d29922]/10 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#d29922]">
        Confirm Action
      </div>
      <div className="mb-2 font-mono text-xs text-[#e6edf3]">
        {data.description}
      </div>
      {hasResponse ? (
        <div className={`text-xs font-medium ${wasApproved ? "text-[#3fb950]" : "text-[#f85149]"}`}>
          {wasApproved ? "✓ Approved" : "✗ Rejected"}
        </div>
      ) : (
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
      )}
    </div>
  );
}
```

---

### Task 7: Update ChatPanel to render confirm cards

**Files:**
- Modify: `packages/frontend/src/components/chat-panel.tsx`

- [ ] **Step 1: Add ConfirmCard rendering**

Add import at the top of `chat-panel.tsx`:

```typescript
import { ConfirmCard } from "./confirm-card";
```

In the `events.map()` switch statement, add a case for `confirm_required` after the `tool_call` case:

```typescript
case "confirm_required": {
  // Find if there's a confirm_response after this event
  const responseEvent = events.find(
    (e) => e.type === "confirm_response" && e.seq > event.seq,
  );
  return (
    <ConfirmCard
      key={event.id}
      event={event}
      conversationId={conversationId}
      hasResponse={!!responseEvent}
      wasApproved={responseEvent ? (responseEvent.data as { approved: boolean }).approved : undefined}
    />
  );
}
```

---

### Task 8: Add mode toggle to Toolbar

**Files:**
- Modify: `packages/frontend/src/components/toolbar.tsx`

- [ ] **Step 1: Add mode toggle button and quota display**

Replace the mode badge `<span>` in `toolbar.tsx` with a clickable toggle:

```typescript
import { useEffect, useState } from "react";
import { getConversation, updateConversation, getQuota, type ConversationResponse, type QuotaResponse } from "../lib/api";
import { useWorkspace } from "../contexts/workspace-context";

interface ToolbarProps {
  conversationId: string;
}

export function Toolbar({ conversationId }: ToolbarProps) {
  const [conv, setConv] = useState<ConversationResponse | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const { previewUrl } = useWorkspace();

  useEffect(() => {
    getConversation(conversationId).then(setConv).catch(console.error);
    getQuota().then(setQuota).catch(console.error);
  }, [conversationId]);

  async function toggleMode() {
    if (!conv) return;
    const newMode = conv.mode === "yolo" ? "confirm" : "yolo";
    const updated = await updateConversation(conversationId, { mode: newMode });
    setConv(updated);
  }

  const usedPercent = quota ? Math.round((quota.usedTokens / quota.totalTokens) * 100) : 0;

  return (
    <div className="flex h-10 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[#e6edf3]">
          {conv?.title || "Untitled"}
        </span>
        <button
          onClick={toggleMode}
          className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-medium ${
            conv?.mode === "confirm"
              ? "bg-[#d29922]/20 text-[#d29922]"
              : "bg-[#238636]/20 text-[#3fb950]"
          }`}
        >
          {conv?.mode || "yolo"}
        </button>
      </div>
      <div className="flex items-center gap-3">
        {quota && (
          <span className="text-[10px] text-[#484f58]">
            {usedPercent}% quota used
          </span>
        )}
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1 text-xs text-[#58a6ff] hover:border-[#58a6ff]"
          >
            Preview ↗
          </a>
        )}
      </div>
    </div>
  );
}
```

---

### Task 9: Final integration verification

- [ ] **Step 1: Type check all packages**

```bash
cd packages/shared && npx tsc --noEmit
cd packages/backend && npx tsc --noEmit
cd packages/frontend && npx tsc --noEmit
```
Expected: No errors in any package.

- [ ] **Step 2: Build frontend**

```bash
cd packages/frontend && pnpm build
```
Expected: Build succeeds.

- [ ] **Step 3: End-to-end test (Confirm Mode)**

1. Start backend: `cd packages/backend && bun run dev`
2. Start frontend: `cd packages/frontend && pnpm dev`
3. Create a new chat
4. Click the mode badge in toolbar to switch to "confirm"
5. Send: "Create a hello.py file that prints hello world"
6. Expected:
   - Chat shows tool_call card
   - Confirm card appears with "Approve" / "Reject" buttons
   - Click "Approve" → tool executes, file appears in editor
   - Click "Reject" on a subsequent tool → agent skips and reports rejection

- [ ] **Step 4: End-to-end test (Quota)**

1. Check toolbar shows "0% quota used"
2. After sending a message and agent responding, quota percentage should update
3. Quota persists across page reloads
