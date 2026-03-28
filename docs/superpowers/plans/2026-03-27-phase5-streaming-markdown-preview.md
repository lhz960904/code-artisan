# Phase 5: Streaming + Markdown + Preview Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude streaming output (progressive text display), Markdown rendering for AI responses, and an embedded preview iframe panel for live sandbox previews.

**Architecture:** Backend switches from `messages.create()` to `messages.stream()`, buffering tokens and periodically updating the `ai_text` event in the DB (via UPDATE, not INSERT). Frontend subscribes to both INSERT and UPDATE events via Supabase Realtime. AI text renders via react-markdown with syntax-highlighted code blocks. Preview panel shows an iframe when a `preview_url` event arrives.

**Tech Stack:** Claude API streaming, react-markdown + react-syntax-highlighter, Supabase Realtime (INSERT + UPDATE), existing workspace layout

---

## File Structure

```
packages/
├── backend/src/
│   └── services/
│       ├── claude.ts                   # Modify: add streaming method
│       └── agent.ts                    # Modify: use streaming, buffer ai_text updates
├── frontend/src/
│   ├── lib/
│   │   └── supabase.ts                # Modify: subscribe to UPDATE events too
│   └── components/
│       ├── chat-panel.tsx             # Modify: use Markdown component for ai_text
│       ├── markdown-renderer.tsx      # Create: react-markdown with code highlighting
│       ├── preview-panel.tsx          # Create: iframe preview panel
│       └── workspace-layout.tsx       # Modify: add preview panel toggle
```

---

### Task 1: Markdown renderer component

**Files:**
- Create: `packages/frontend/src/components/markdown-renderer.tsx`
- Modify: `packages/frontend/src/components/chat-panel.tsx`

- [ ] **Step 1: Install syntax highlighting dependency**

```bash
cd packages/frontend && pnpm add react-syntax-highlighter @types/react-syntax-highlighter
```

- [ ] **Step 2: Create MarkdownRenderer component**

Create `packages/frontend/src/components/markdown-renderer.tsx`:

```typescript
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match;
          return isInline ? (
            <code
              className="rounded bg-[#21262d] px-1 py-0.5 text-xs text-[#e6edf3]"
              {...props}
            >
              {children}
            </code>
          ) : (
            <SyntaxHighlighter
              style={oneDark}
              language={match[1]}
              PreTag="div"
              customStyle={{
                margin: "0.5rem 0",
                borderRadius: "0.375rem",
                fontSize: "0.75rem",
              }}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          );
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mb-2 list-disc pl-4">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-2 list-decimal pl-4">{children}</ol>;
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#58a6ff] underline">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 3: Use MarkdownRenderer in ChatPanel**

In `chat-panel.tsx`, replace the ai_text rendering from:
```tsx
<div className="whitespace-pre-wrap text-sm leading-relaxed text-[#e6edf3]">
  {(event.data as { content: string }).content}
</div>
```
to:
```tsx
<div className="text-sm leading-relaxed text-[#e6edf3]">
  <MarkdownRenderer content={(event.data as { content: string }).content} />
</div>
```

- [ ] **Step 4: Verify markdown renders**

Start frontend, send a message that produces markdown (e.g., "explain how a promise works in JavaScript with a code example"). AI response should render with formatted code blocks, bold text, lists.

---

### Task 2: Claude streaming + progressive ai_text updates

**Files:**
- Modify: `packages/backend/src/services/claude.ts`
- Modify: `packages/backend/src/services/agent.ts`
- Modify: `packages/backend/src/services/event-store.ts`

- [ ] **Step 1: Add streaming method to ClaudeService**

Add a new `chatStream` method to `packages/backend/src/services/claude.ts`:

```typescript
async chatStream(
  messages: MessageParam[],
  onText: (text: string) => void,
): Promise<ClaudeResponse> {
  const stream = this.client.messages.stream({
    model: "claude-opus-4-5-20250414",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
    messages,
  });

  let fullText = "";

  stream.on("text", (text) => {
    fullText += text;
    onText(fullText);
  });

  const response = await stream.finalMessage();

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  const toolBlock = response.content.find((block) => block.type === "tool_use");
  const textBlock = response.content.find((block) => block.type === "text");

  if (toolBlock && toolBlock.type === "tool_use") {
    return {
      type: "tool_use",
      toolCallId: toolBlock.id,
      toolName: toolBlock.name,
      toolInput: toolBlock.input as Record<string, string>,
      textContent: textBlock?.type === "text" ? textBlock.text : "",
      usage,
    };
  }

  const textContent = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as Anthropic.TextBlock).text)
    .join("\n");

  return { type: "text", content: textContent, usage };
}
```

- [ ] **Step 2: Add updateEvent method to EventStore**

Add to `packages/backend/src/services/event-store.ts`:

```typescript
async updateEvent(eventId: string, data: AgentEventData): Promise<void> {
  await db
    .update(events)
    .set({ data: data as Record<string, unknown> })
    .where(eq(events.id, eventId));
}
```

Also add the `id` import from drizzle schema if needed, and add `eq` for the `events.id` field.

- [ ] **Step 3: Update agent to use streaming**

In `packages/backend/src/services/agent.ts`, modify the main loop to use `chatStream` instead of `chat`.

For text responses, create the ai_text event first, then update it as text streams in:

```typescript
// Instead of:
// const response = await this.claude.chat(history);

// Create a placeholder ai_text event
const [aiTextEvent] = await db
  .insert(events_table)
  .values({ conversationId, type: "ai_text", data: { content: "" } })
  .returning({ id: events_table.id });

let lastUpdate = 0;
const response = await this.claude.chatStream(history, (text) => {
  const now = Date.now();
  if (now - lastUpdate > 200) { // throttle to every 200ms
    lastUpdate = now;
    store.updateEvent(aiTextEvent.id, { content: text });
  }
});

if (response.type === "text") {
  // Final update with complete text
  await store.updateEvent(aiTextEvent.id, { content: response.content });
  await quota.addUsage(response.usage.inputTokens, response.usage.outputTokens);
  break;
} else {
  // It was a tool_use — the ai_text event has the textContent
  if (response.textContent) {
    await store.updateEvent(aiTextEvent.id, { content: response.textContent });
  } else {
    // No text, delete the empty placeholder
    await db.delete(events_table).where(eq(events_table.id, aiTextEvent.id));
  }
  // ... continue with tool handling
}
```

- [ ] **Step 4: Verify streaming works**

Start backend + frontend, send a message. AI text should appear progressively in the chat panel, not all at once.

---

### Task 3: Subscribe to UPDATE events in Supabase Realtime

**Files:**
- Modify: `packages/frontend/src/lib/supabase.ts`

- [ ] **Step 1: Add UPDATE subscription**

In `useConversationEvents`, add an UPDATE handler alongside the existing INSERT handler:

```typescript
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
        if (prev.some((e) => e.id === newEvent.id)) return prev;
        return [...prev, newEvent];
      });
      lastSeqRef.current = Math.max(lastSeqRef.current, newEvent.seq);
    },
  )
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "events",
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      const updated = payload.new as RealtimeEvent;
      setEvents((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
    },
  )
  .subscribe();
```

- [ ] **Step 2: Verify progressive text updates**

Send a message. The ai_text event should update in-place as the backend streams tokens, showing progressive text appearing in the chat.

---

### Task 4: Preview iframe panel

**Files:**
- Create: `packages/frontend/src/components/preview-panel.tsx`
- Modify: `packages/frontend/src/components/workspace-layout.tsx`

- [ ] **Step 1: Create PreviewPanel component**

Create `packages/frontend/src/components/preview-panel.tsx`:

```typescript
import { useWorkspace } from "../contexts/workspace-context";

export function PreviewPanel() {
  const { previewUrl, setPreviewUrl } = useWorkspace();

  if (!previewUrl) return null;

  return (
    <div className="flex h-full flex-col border-l border-[#30363d]">
      <div className="flex h-8 items-center justify-between border-b border-[#30363d] bg-[#161b22] px-3">
        <span className="text-xs text-[#8b949e]">Preview</span>
        <div className="flex items-center gap-2">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#58a6ff] hover:underline"
          >
            Open ↗
          </a>
          <button
            onClick={() => setPreviewUrl(null)}
            className="text-xs text-[#484f58] hover:text-[#f85149]"
          >
            ×
          </button>
        </div>
      </div>
      <iframe
        src={previewUrl}
        className="flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Preview"
      />
    </div>
  );
}
```

- [ ] **Step 2: Integrate PreviewPanel into WorkspaceLayout**

Modify `packages/frontend/src/components/workspace-layout.tsx` to show the preview panel when a preview URL is available:

Add import and render PreviewPanel alongside or replacing the editor+terminal stack when preview is active. The simplest approach: show preview panel as a split view next to editor.

```typescript
import { PreviewPanel } from "./preview-panel";
import { useWorkspace } from "../contexts/workspace-context";

// Inside WorkspaceLayout:
const { previewUrl } = useWorkspace();

// In the right-side workspace area, wrap editor+terminal in a flex container
// and conditionally show PreviewPanel:
<div className="flex flex-1 overflow-hidden">
  {/* File Tree */}
  <div className="w-52 shrink-0 overflow-y-auto border-r border-[#30363d] bg-[#161b22]">
    <FileTree />
  </div>

  {/* Editor + Terminal stack */}
  <div className={`flex flex-col overflow-hidden ${previewUrl ? "w-1/2" : "flex-1"}`}>
    <div className="flex-1 overflow-hidden">
      <EditorPanel />
    </div>
    <div className="h-48 shrink-0 border-t border-[#30363d]">
      <TerminalPanel />
    </div>
  </div>

  {/* Preview Panel (when available) */}
  {previewUrl && (
    <div className="w-1/2 overflow-hidden">
      <PreviewPanel />
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify preview panel**

Start a conversation, ask AI to create a web server. When `preview_url` event arrives, the preview iframe should appear on the right half, splitting the editor area.

---

### Task 5: Final verification

- [ ] **Step 1: Type check**

```bash
cd packages/backend && npx tsc --noEmit
cd packages/frontend && npx tsc --noEmit
```

- [ ] **Step 2: Build**

```bash
cd packages/frontend && pnpm build
```

- [ ] **Step 3: E2E test**

1. Start backend + frontend
2. Create chat, send "Write a simple express hello world server and start it"
3. Verify: AI text streams progressively with markdown formatting
4. Verify: Server starts, preview iframe appears
5. Verify: Code appears in editor, commands in terminal
