# Proposal: Server-side Message ID in SSE Stream

## Background

The database already generates a UUID primary key for each message (`messages.id`), but the SSE stream (`AgentEvent`) does not carry this ID. As a result, the frontend is forced to maintain three ad-hoc ID schemes:

| Prefix | Purpose | Drawback |
|--------|---------|----------|
| `opt-` | Optimistic user message placeholder | Becomes a different UUID after page refresh |
| `streaming-` | Partial assistant message during streaming | Used as a fragile convention to detect streaming state |
| `msg-` | Fallback ID for final `message` events | `Date.now()` is not unique; no link to the database record |

This leads to:
- **ID fragmentation**: the same logical message has different IDs across its lifecycle.
- **Fragile state detection**: streaming state is inferred from string prefix (`streaming-`) rather than semantic event type, causing subtle bugs (e.g., thinking blocks not hiding after stream ends).
- **Frontend-backend ID mismatch**: on page refresh, IDs jump from `opt-`/`msg-` to database UUIDs.

## Proposal

Make `_insertMessage` return the database-generated UUID and include it in the SSE `message` event.

### Backend Changes

#### 1. `_insertMessage` returns the row ID

```typescript
// packages/backend/src/services/agent-turn.ts
private async _insertMessage(message: Message): Promise<string> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: this.conversation.id,
      role: message.role,
      content: message.content,
    })
    .returning({ id: messages.id });
  return row.id;
}
```

#### 2. `run()` attaches the ID to `message` events

```typescript
for await (const event of this.agent.stream(userMessage)) {
  // ... pending events ...
  if (event.type === "message") {
    const id = await this._insertMessage(event.message);
    yield { ...event, messageId: id };
  } else {
    yield event;
  }
}
```

#### 3. Also return the user message ID

```typescript
const userMessageId = await this._insertMessage(userMessage);
// yield as the first event so the frontend can replace the opt- placeholder
yield { type: "user_ack", messageId: userMessageId };
```

### Shared Type Changes

```typescript
// packages/shared/src/types.ts
export type WebAgentEvent =
  | AgentEvent
  | { type: "user_ack"; messageId: string }  // NEW
  | { type: "quota_exceeded" }
  | { type: "file_update"; files: Array<{ path: string; content: string }> }
  | { type: "file_delete"; paths: string[] }
  | { type: "error"; message: string };

// Extend AgentMessageEvent to carry the optional server ID
export interface AgentMessageEvent {
  type: "message";
  message: AssistantMessage | ToolMessage;
  messageId?: string;  // database UUID, present when sent from backend
}
```

### Frontend Changes

```typescript
// packages/frontend/src/hooks/use-chat.ts — handleEvent
case "user_ack": {
  // Replace optimistic opt- ID with the real database UUID
  updateMessages((prev) =>
    prev.map((m) => (m.id === optimisticIdRef.current ? { ...m, id: event.messageId } : m)),
  );
  break;
}

case "message": {
  const id = event.messageId ?? `msg-${Date.now()}`; // fallback for backward compat
  // ... rest unchanged
}
```

After this change, streaming detection should use **status** instead of ID prefix:

```typescript
// message-list.tsx
// Before:  isStreaming={message.id.startsWith("streaming-")}
// After:   derive from chat status or a dedicated streaming flag
```

## Benefits

1. **Single source of truth**: every message has a stable database UUID from birth.
2. **Robust streaming detection**: no more string-prefix hacks.
3. **Refresh consistency**: IDs never change between SSE and GET responses.
4. **Future-proof**: enables message edit/retry/delete, feedback (thumbs up/down), multi-tab sync, reconnection recovery, and audit logging.

## Migration

- **Backward compatible**: `messageId` is optional on `AgentMessageEvent`. The frontend falls back to `msg-` if absent.
- **No database migration needed**: the `id` column already exists and is auto-generated.
- **Incremental rollout**: can land backend and frontend changes independently.
