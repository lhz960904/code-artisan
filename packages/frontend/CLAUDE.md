# @code-artisan/frontend

Vite + React 19 SPA that drives the agent from a workspace-style UI. TanStack Router owns route tree and auth guards; TanStack Query owns server cache (incl. the live message list during a turn); Zustand owns ephemeral cross-page state (workspace files + draft prompts + model pref). Chat streams over SSE; terminals stream over a conversation-scoped WebSocket. Agent blocks render directly — no shape translation.

## Structure

```text
src/
  main.tsx, app.tsx      Entry; wires QueryClient, ThemeProvider, TanStack router (routes: home, login, dashboard, chat, debug-messages). mcp-servers route is kept commented out.
  index.css              Tailwind v4 @theme tokens (shadcn CSS-variable convention) + light/dark themes + Miro-aligned palette
  api/
    client.ts            apiFetch wrapper — credentials:include, 401 → /login redirect, unwraps { data }
    queries/             TanStack Query query options
      conversations.ts     list / detail / messages / fileSnapshots
      models.ts            modelsOptions() — GET /api/models (public route)
      quota.ts             quotaOptions() — Coins pill in header
      mcp-servers.ts       registry + installed state
      index.ts             Re-exports
    mutations/           useConversationCreate/Update/Delete, uploadFile, mcp-server mutations
    mutations/upload.ts  POST /api/attachment → Attachment metadata (cookie-authed like the rest of /api)
  components/
    ui/                  shadcn primitives (button, textarea, dialog, dropdown-menu, popover, tabs, tooltip, skeleton, resizable, …)
    common/              Logo, MarkdownRenderer (react-markdown + remark-gfm + syntax highlighter), ThemeToggle
    layout/              HomeHeader, AppSidebar, UserProfile (site-wide shells)
    chat/
      sender.tsx              Unified prompt input (default / large); PlusMenu + ModelPicker via DropdownMenu; drag/paste/pick attachments; provider icons come from `@/assets/model-icons/{provider}.svg`
      attachment-preview.tsx  Chips; File OR already-uploaded Attachment metadata
      chat-panel.tsx          Chat column: mounts useChat, owns the PendingPrompt→sendMessage bootstrap, owns the `pendingChatMessage` relay from the workspace store (e.g. Preview's "Start dev server" button)
      message-list.tsx        Orchestrates chunk rendering + "Thinking…" indicator (only during submitted/running)
      message-chunks.ts       buildChunks(messages, { streamingMessageId }) → RenderChunk[] for the view layer
      message-bubble.tsx      UserBubble, AssistantText, ThinkingQuote, CompactedBlock
      todo-list-card.tsx      Bolt-style plan card; groups todo_write calls by `name`; nested steps per todo; auto-expands the currently in-progress todo
      tool-call-item.tsx      Single loose tool call (icon + label + expandable output); TOOL_CONFIG drives icons
    workspace/
      workspace-layout.tsx  Wraps the workspace in <ConversationWsProvider> (keyed by conversationId). 2-column ResizablePanelGroup (chat / right-card). Chat panel publishes its pixel width to `--chat-panel-width` CSS var via onResize so Header's ViewSwitcher can absolute-align to the FileTree column.
      conversation-ws-context.tsx  Owns a single ConversationWsClient per mounted conversation. Holds the authoritative `sessions: DisplaySession[]` (server sessions + local "pending" drafts). Exposes `{ client, sessions, setSessions, subscribe }` so sub-panels (Terminal, future Agent-action panels) share one socket.
      header.tsx            In-workspace header (brand + title · absolute-positioned ViewSwitcher aligned to Files column via `--chat-panel-width` · Coins token pill + Avatar dropdown with Theme switch + Sign out); exports HeaderSkeleton
      right-panel.tsx       Fetches snapshots via useQuery → populates workspace store; routes view (preview/code/database) from workspace store. CodeView is the resizable (editor-area / terminal) + (file-tree / editor) composition — terminal is collapsible.
      preview-panel.tsx     4-state smart preview: snapshot-loading skeleton → empty (no files) → no-server (shows "Start development server" CTA that pushes into `workspace.pendingChatMessage`) → live iframe with URL/refresh/open-in-new-tab chrome + `<BrowserErrorBadge>`. Mounts `useIframeBridge(iframeRef)` for the lifetime of the panel.
      browser-error-badge.tsx  Red AlertCircle + count badge that appears in the preview toolbar when `workspace.browserErrors` is non-empty. Popover lists errors (source label + filename:line + red message); "Ask AI to fix" formats them into a structured prompt and dispatches via `setPendingChatMessage` (clears the buffer on send). Hidden when count is 0.
      database-panel.tsx    Placeholder "Database coming soon" panel
      editor-panel.tsx      Monaco editor; theme follows useTheme().resolved (vs / vs-dark); consumes `pendingReveal` to scroll/focus a line
      terminal-panel.tsx    xterm.js tabbed panel driven by useConversationWs(). Snapshots replay on attach; max 3 user terminals; agent-owned sessions render as read-only tabs (no close button, lightning icon); local "pending" draft flow swaps its id on `created`. Theme repaint via term.refresh() on theme change.
      file-tree.tsx         `FilesPanel` — sticky h-9 tab header (Files / Search, Bolt-style) switches between `FileTreeView` (directory-sorted tree) and `FileSearch`. Files live-updated from SSE `file_update` / `file_delete` into the workspace store.
      file-search.tsx       In-workspace grep: path + content matches, `Aa` case-sensitive + `.*` regex toggles, line-number preview, click-to-open
  lib/
    conversation-ws.ts   ConversationWsClient — single WebSocket per conversation with exponential reconnect + outbox queue; typed ClientMessage/ServerMessage wire protocol mirroring the backend
    auth-client.ts       better-auth/react client + getSession
    utils.ts             cn = clsx + tailwind-merge; resolveAttachmentUrl helper
  hooks/
    use-chat.ts          SSE consumer backed by the TanStack Query cache; handles title_update / file_update / quota_exceeded / error. After the stream settles, invalidates the conversation detail so a freshly-exposed `previewUrl` is picked up.
    use-file-upload.ts   Selected-file lifecycle; each addFiles triggers an immediate background upload — state: uploading → done/error
    use-start-conversation.ts Shared "create conversation + navigate" flow (auth gate + store stash)
    use-iframe-bridge.ts  Listens to cross-origin `message` events from the preview iframe. Filters by origin (must match `previewUrl`'s origin) + source (must equal `iframeRef.current.contentWindow`) + brand (`isIframeBridgeMessage`); dispatches `ready` → `setIframeRuntimeReady`, `error` → `appendBrowserError`. Protocol types live in `@code-artisan/shared/iframe-protocol`.
  stores/
    workspace.ts         Live in-session state: files map (seeded from snapshots, mutated by SSE), open tabs, `previewUrl`, `view` ("preview" | "code" | "database") persisted to localStorage, `pendingReveal` (editor jump-to-line handoff), `pendingChatMessage` (Preview→Chat submit relay), `snapshotsLoaded` gate, `browserErrors` (capped 50 ring buffer of `BrowserError` from iframe runtime), `iframeRuntimeReady` (handshake flag).
    pending-prompt.ts    Cross-page prompt handoff: draft slot (Home→Dashboard, JSON-persisted via sessionStorage to survive GitHub OAuth) + byConversationId (Dashboard→chat), shape { prompt, attachments: Attachment[] }
    model-prefs.ts       Selected model id, backed by `localStorage["code-artisan.modelPrefs"]`; falls back to DEFAULT_MODEL_ID on missing/corrupt value. Sender reads/writes it.
  contexts/theme-context.tsx  light/dark/system toggle stored in localStorage
  assets/model-icons/    Per-provider SVGs (anthropic, moonshot) used by the model picker
  pages/
    layout/root.tsx      Root route + RouterContext (queryClient)
    layout/authed.tsx    Session gate; redirect to /login with ?redirect=
    home.tsx             Public landing; animated typing placeholder + Sender
    login.tsx            GitHub OAuth (other providers disabled)
    dashboard.tsx        Authed hub; consumes draft on mount (pre-fills sender), lists conversations
    chat.tsx             /chat/:conversationId — loader prefetches detail/messages/snapshots/quota; resets workspace store on conversationId change; seeds `previewUrl` from conversation detail effect.
    debug-messages.tsx   Dev-only message-rendering playground
    mcp-servers.tsx      Scaffolded but currently commented out — not mounted in the router.
public/, index.html, vite.config.ts, components.json (shadcn), eslint.config.js
```

## ChatStatus

`ready | submitted | running | streaming | error`. Drives Sender's `busy`, the "Thinking" indicator (shown only in `submitted` / `running`), and TodoListCard's live spinners (anything other than `ready` / `error`). `running` is skipped on the final assistant-text turn (no tool_use) so the UI doesn't flash before settling to `ready`.

## Message rendering pipeline

1. `useChat` keeps the cached message list at `conversationKeys.messages(conversationId)` in sync with SSE events.
2. `MessageList` derives `streamingMessageId` (id of the last assistant message when status is `streaming`) and calls `buildChunks`.
3. `buildChunks` walks messages from the last compaction boundary:
   - `metadata.compacted` → `CompactedChunk`.
   - user → `UserChunk`.
   - assistant text → `AssistantTextChunk`; thinking → `ThinkingChunk` (suppressed on prior assistant messages that also emitted a tool_use — only kept for the currently streaming message);
   - `tool_use` where `name === "todo_write"` → creates or updates a `TodoListChunk` keyed by `input.name`; `merge=false` replaces, default merges by id and preserves existing steps.
   - Other `tool_use` after a todo list → folded as a `TaskStep` under the list's currently `in_progress` todo; otherwise rendered as a loose `LooseToolChunk`.
4. `ChunkRenderer` dispatches by `kind` → `UserBubble | AssistantText | ThinkingQuote | TodoListCard | ToolCallItem | CompactedBlock`.

## Server-minted message ids

Backend emits one UUID per assistant turn, shared across the turn's `partial` + final `message` events. `useChat` uses it as the React key from birth — no client-side id minting for assistant/tool messages. User messages get an optimistic `crypto.randomUUID()` on send and are swapped to the DB id via `user_message_saved`.

## SSE events handled by `useChat`

`user_message_saved` (swap optimistic id) · `partial` (status→streaming, upsert snapshot) · `message` (upsert; skip `running` flash on final assistant text) · `title_update` (patch conversation detail + list caches) · `file_update` / `file_delete` (pipe into `useWorkspaceStore.getState().updateFile` / `deleteFile` — file tree reflects changes live) · `quota_exceeded` · `error`. Initial files still come from the `fileSnapshots` query on mount; SSE takes over as mutations stream. After the stream drains, `useChat` invalidates `conversationKeys.detail` so a freshly-exposed `previewUrl` gets seeded via ChatPage's effect.

## Conversation WebSocket

One `ConversationWsClient` per mounted conversation, owned by `<ConversationWsProvider>` in `workspace-layout.tsx` (keyed by conversationId). Keeps an exponential-backoff reconnect loop with an outbox queue for sends during disconnect. Emits typed `ServerMessage` events to subscribers; also synthesises `{op: "open"}` and `{op: "close"}` for lifecycle observers.

The provider holds the authoritative sessions list (merging server `sessions` / `session_started` / `session_ended` / `created` / `create_failed` with local "pending" drafts for optimistic UI). Sub-panels call `useConversationWs()` to get `{client, sessions, setSessions, subscribe}` and layer their own per-mount logic (e.g. TerminalPanel consumes `snapshot` / `data` to paint xterm, swaps `activeId` on `created`).

Terminal draft flow: user clicks "+" → `crypto.randomUUID()` → push a `{status: "pending"}` row → `client.create({ draftId, cols, rows })` → server replies `created { draftId, meta }` → Terminal swaps `activeId` from draft to real; provider's list listener swaps the row. On `create_failed`, the draft row is dropped.

## Flows

**Submit from Home / Dashboard.** `useStartConversation.start(prompt, attachments: Attachment[])` → `getSession()`. Unauth → `setDraft({prompt, attachments})` (sessionStorage + Zustand) → `/login?redirect=/dashboard`. Auth → `useConversationCreate` → `setForConversation(id, …)` → `/chat/$conversationId`. Attachments were already uploaded when the user dropped/pasted them, so `start` only ferries serialisable metadata — OAuth full-page redirect is safe.

**Home → login → dashboard resume.** Dashboard mounts → `consumeDraft()` → push prompt into Sender's controlled `value` and seed fileUpload via `seedUploaded(attachments)`. User still clicks Start themselves (no auto-fire).

**Chat turn.** `chat.tsx` loader prefetches detail/messages/snapshots/quota → `WorkspaceLayout` → `ChatPanel` mounts `useChat(conversationId)`. On first `status==="ready"`, consumes `byConversationId` and calls `sendMessage(prompt, { attachments, model: useModelPrefsStore.getState().model })` once. `sendMessage` POSTs `{content, attachments, model}` to `/api/message/:id`, optimistically appends a user message to the query cache, then parses SSE frames and mutates the cache directly via `queryClient.setQueryData`.

**Preview "Start dev server" shortcut.** PreviewPanel's CTA calls `setPendingChatMessage("Please start this project's development server")` → ChatPanel's effect sees the change on next `ready` and dispatches it through `sendMessage` with the currently-selected model, then clears.

**Browser error capture (preview iframe → AI).** The sandbox-side Vite plugin (`@code-artisan/iframe-runtime`) injects an IIFE into the user's app HTML at HTTP-response time. The runtime catches `window.error` / `unhandledrejection` / filtered `console.error`, posts each to the parent over a brand-tagged postMessage protocol. `useIframeBridge` (mounted by PreviewPanel) filters by origin + source + brand, dispatches into `workspace.browserErrors`. `BrowserErrorBadge` shows a red count badge in the preview toolbar; clicking "Ask AI to fix" formats all buffered errors into a structured prompt and pushes through `setPendingChatMessage` → ChatPanel auto-sends → buffer clears. No backend persistence — errors are session-ephemeral.

**File attachment.** Sender's drag/paste/pick → `fileUpload.addFiles(files)` → state entry per file transitions `uploading → done` as each `POST /api/attachment` resolves. Consumers read `fileUpload.attachments: Attachment[]`. `isUploading` drives Sender's disabled state.

## Conventions

- **Routes are first-class exports.** Each page file exports its own `createRoute(...)`; `app.tsx` assembles the tree. Auth gate lives on `authedRoute.beforeLoad`, not inside pages.
- **Chat state is query cache, not local state.** `useChat` reads and writes `conversationKeys.messages(conversationId)` directly — a single source of truth shared with prefetch/refresh.
- **Data fetching = TanStack Query.** Queries defined as `*Options()` factories in `api/queries/`; pages use `useSuspenseQuery(xxxOptions())`. Mutations are hook wrappers invalidating the right keys.
- **Ephemeral state = Zustand.** Never persist live workspace state to server; the backend owns the source of truth. Stores live under `src/stores/`. `model-prefs` is the only store that round-trips through localStorage by design.
- Use **`apiFetch`** for typed `/api/*` calls. It strips the `{ data }` envelope, centralises 401 redirect, and always sends cookies.
- **Sender is presentational.** Callers own submission side-effects. Controlled mode (`value` + `onChange`) is used wherever the page needs to pre-fill. Sender also owns the model picker UI but delegates the selected id to `useModelPrefsStore`.
- **One ConversationWsClient per conversation.** Always go through `useConversationWs()`; never construct the client directly from a sub-panel — that would fork the session list.
- **Naming.** Spell out identifiers (conversation, not conv; message, not msg). Hooks are `useX`; stores are `useXStore`.
- **Theming.** Tailwind v4 `@theme inline` + HSL CSS variables (`--background`, `--ring`, pastel slots). `cn()` merges. Monaco follows `useTheme().resolved`; xterm reads a dark/light palette object and calls `term.refresh()` on theme change.
- **Resizable panels (v4 gotcha).** `react-resizable-panels` v4 treats `defaultSize={number}` as raw flex-basis pixels (v3 used percent) — always use string form `"28%"`. `ResizablePanelGroup` wrapper in `ui/resizable.tsx` auto-enables persistence via `useDefaultLayout` when `id` is passed. Use `panelIds={[...]}` on the group so stale localStorage layouts with different panel sets get ignored.
- **Cross-panel alignment.** When a Header element needs to line up with a column inside the resizable workspace (e.g. ViewSwitcher aligning to FileTree), the chat `ResizablePanel` writes its live pixel width to `document.documentElement.style['--chat-panel-width']` via `onResize`, and the Header element uses `left: calc(var(--chat-panel-width) + offset)` absolute positioning.

## Tech

Vite 6, React 19, TypeScript 5.9, Tailwind v4 (@theme inline), shadcn/ui (new-york style, `components.json`) + radix-ui primitives, TanStack Router 1.95, TanStack Query 5.95, Zustand 5, better-auth/react, Monaco + xterm for workspace panels, lucide icons, `react-markdown` + `remark-gfm` + `react-syntax-highlighter`.

## Relationship

Frontend = orchestration + presentation. Backend owns persistence, agent execution, sandbox, quota, storage, title generation, PTY-backed long-running processes, and preview exposure. Server messages arrive as JSONB-mirrored agent blocks (see `@code-artisan/shared`) and render without shape translation. Two transports: SSE (unidirectional, per-turn, scoped to `POST /api/message/:id`) and a conversation-scoped WebSocket (bidirectional, long-lived, scoped to the workspace mount) — everything else is plain REST under `/api/*`.
