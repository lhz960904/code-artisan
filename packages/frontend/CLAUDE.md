# @code-artisan/frontend

Vite + React 19 SPA that drives the agent from a workspace-style UI. TanStack Router owns route tree and auth guards; TanStack Query owns server cache (incl. the live message list during a turn); Zustand owns ephemeral cross-page state (workspace files + draft prompts). Chat streams over SSE from the backend and renders agent blocks directly — no shape translation.

## Structure

```text
src/
  main.tsx, app.tsx      Entry; wires QueryClient, ThemeProvider, TanStack router (routes: home, login, dashboard, chat, debug-messages)
  index.css              Tailwind v4 @theme tokens (shadcn CSS-variable convention) + light/dark themes + Miro-aligned palette
  api/
    client.ts            apiFetch wrapper — credentials:include, 401 → /login redirect, unwraps { data }
    queries/             TanStack Query query options (conversations, messages, snapshots, quota, mcp-servers)
    queries/index.ts     Re-exports + queryFn helpers used directly (e.g. fetchConversationMessages)
    mutations/           useConversationCreate/Update/Delete, uploadFile, mcp-server mutations
    mutations/upload.ts  POST /api/attachment → Attachment metadata (cookie-authed like the rest of /api)
  components/
    ui/                  shadcn primitives (button, textarea, dialog, dropdown-menu, tabs, tooltip, skeleton, resizable, …)
    common/              Logo, MarkdownRenderer (react-markdown + remark-gfm + syntax highlighter), ThemeToggle
    layout/              HomeHeader, AppSidebar, UserProfile (site-wide shells)
    chat/
      sender.tsx              Unified prompt input (default / large); PlusMenu + ModelPicker via DropdownMenu; drag/paste/pick attachments
      attachment-preview.tsx  Chips; File OR already-uploaded Attachment metadata
      chat-panel.tsx          Chat column: mounts useChat, renders MessageList, shows error banner, owns Sender submit
      message-list.tsx        Orchestrates chunk rendering + "Thinking…" indicator (only during submitted/running)
      message-chunks.ts       buildChunks(messages, { streamingMessageId }) → RenderChunk[] for the view layer
      message-bubble.tsx      UserBubble, AssistantText, ThinkingQuote, CompactedBlock
      todo-list-card.tsx      Bolt-style plan card; groups todo_write calls by `name`; nested steps per todo
      tool-call-item.tsx      Single loose tool call (icon + label + expandable output); TOOL_CONFIG drives icons
    workspace/
      workspace-layout.tsx  3-layer ResizablePanelGroup (chat / right-card + vertical (editor-area / terminal) + horizontal (file-tree / editor)); Chat panel publishes its pixel width to `--chat-panel-width` CSS var via onResize so Header's ViewSwitcher can absolute-align to FileTree column
      header.tsx            In-workspace header (left brand + title · absolute-positioned ViewSwitcher aligned to Files column · right Coins token pill + Avatar dropdown with Theme switch + Sign out); exports HeaderSkeleton
      right-panel.tsx       Fetches snapshots via useQuery and populates workspace store; routes view (preview/code/database) from workspace store into PreviewPanel / CodeView / DatabasePanel
      database-panel.tsx    Placeholder "Database coming soon" panel
      editor-panel.tsx      Monaco editor; theme follows useTheme().resolved (vs / vs-dark)
      terminal-panel.tsx    xterm.js; reads CSS vars for theme; on theme change waits 1 frame then term.refresh() to repaint scrollback
      file-tree.tsx         `FilesPanel` — sticky h-9 tab header (Files / Search, Bolt-style) switches between `FileTreeView` (directory-sorted tree) and `FileSearch`. Files live-updated from SSE `file_update` / `file_delete` into the workspace store.
      file-search.tsx       In-workspace grep: path + content matches, `Aa` case-sensitive + `.*` regex toggles, line-number preview, click-to-open
  hooks/
    use-chat.ts          SSE consumer backed by the TanStack Query cache; exposes { messages, status, sendMessage, stop, error }
    use-file-upload.ts   Selected-file lifecycle; each addFiles triggers an immediate background upload — state: uploading → done/error
    use-start-conversation.ts Shared "create conversation + navigate" flow (auth gate + store stash)
  stores/
    workspace.ts         Live in-session workspace state (files map seeded from snapshots, open tabs, terminal history, preview URL, active view: "preview" | "code" | "database"). `openFileAt(path, line)` writes a `pendingReveal` which EditorPanel's effect consumes to `revealLineInCenter` + focus, then clears.
    pending-prompt.ts    Cross-page prompt handoff: draft slot (Home→Dashboard, JSON-persisted via sessionStorage to survive GitHub OAuth) + byConversationId (Dashboard→chat), shape { prompt, attachments: Attachment[] }
  contexts/theme-context.tsx  light/dark/system toggle stored in localStorage
  lib/
    auth-client.ts       better-auth/react client + getSession
    utils.ts             cn = clsx + tailwind-merge; resolveAttachmentUrl helper
  pages/
    layout/root.tsx      Root route + RouterContext (queryClient)
    layout/authed.tsx    Session gate; redirect to /login with ?redirect=
    home.tsx             Public landing; animated typing placeholder
    login.tsx            GitHub OAuth (other providers disabled)
    dashboard.tsx        Authed hub; consumes draft on mount (pre-fills sender), lists conversations
    chat.tsx             /chat/:conversationId — loader prefetches detail/messages/snapshots/quota; resets workspace store on conversationId change
    debug-messages.tsx   Dev-only message-rendering playground
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

`user_message_saved` (swap optimistic id) · `partial` (status→streaming, upsert snapshot) · `message` (upsert; skip `running` flash on final assistant text) · `title_update` · `file_update` / `file_delete` (pipe into `useWorkspaceStore.getState().updateFile` / `deleteFile` — file tree reflects changes live) · `quota_exceeded` · `error`. Initial files still come from the `fileSnapshots` query on mount; SSE takes over as mutations stream.

## Flows

**Submit from Home / Dashboard.** `useStartConversation.start(prompt, attachments: Attachment[])` → `getSession()`. Unauth → `setDraft({prompt, attachments})` (sessionStorage + Zustand) → `/login?redirect=/dashboard`. Auth → `useConversationCreate` → `setForConversation(id, …)` → `/chat/$conversationId`. Attachments were already uploaded when the user dropped/pasted them, so `start` only ferries serialisable metadata — OAuth full-page redirect is safe.

**Home → login → dashboard resume.** Dashboard mounts → `consumeDraft()` → push prompt into Sender's controlled `value` and seed fileUpload via `seedUploaded(attachments)`. User still clicks Start themselves (no auto-fire).

**Chat turn.** `chat.tsx` loader prefetches detail/messages/snapshots/quota → `WorkspaceLayout` → `ChatPanel` mounts `useChat(conversationId)`. On first `status==="ready"`, consumes `byConversationId` and calls `sendMessage(prompt, attachments)` once. `sendMessage` POSTs to `/api/message/:id`, optimistically appends a user message to the query cache, then parses SSE frames and mutates the cache directly via `queryClient.setQueryData`.

**File attachment.** Sender's drag/paste/pick → `fileUpload.addFiles(files)` → state entry per file transitions `uploading → done` as each `POST /api/attachment` resolves. Consumers read `fileUpload.attachments: Attachment[]`. `isUploading` drives Sender's disabled state.

## Conventions

- **Routes are first-class exports.** Each page file exports its own `createRoute(...)`; `app.tsx` assembles the tree. Auth gate lives on `authedRoute.beforeLoad`, not inside pages.
- **Chat state is query cache, not local state.** `useChat` reads and writes `conversationKeys.messages(conversationId)` directly — a single source of truth shared with prefetch/refresh.
- **Data fetching = TanStack Query.** Queries defined as `*Options()` factories in `api/queries/`; pages use `useSuspenseQuery(xxxOptions())`. Mutations are hook wrappers invalidating the right keys.
- **Ephemeral state = Zustand.** Never persist live workspace state to server; the backend owns the source of truth. Stores live under `src/stores/`.
- Use **`apiFetch`** for typed `/api/*` calls. It strips the `{ data }` envelope, centralises 401 redirect, and always sends cookies.
- **Sender is presentational.** Callers own submission side-effects. Controlled mode (`value` + `onChange`) is used wherever the page needs to pre-fill.
- **Naming.** Spell out identifiers (conversation, not conv; message, not msg). Hooks are `useX`; stores are `useXStore`.
- **Theming.** Tailwind v4 `@theme inline` + HSL CSS variables (`--background`, `--ring`, pastel slots). `cn()` merges. Monaco follows `useTheme().resolved`; xterm reads CSS vars and calls `term.refresh()` on theme change.
- **Resizable panels (v4 gotcha).** `react-resizable-panels` v4 treats `defaultSize={number}` as raw flex-basis pixels (v3 used percent) — always use string form `"28%"`. `ResizablePanelGroup` wrapper in `ui/resizable.tsx` auto-enables persistence via `useDefaultLayout` when `id` is passed. Use `panelIds={[...]}` on the group so stale localStorage layouts with different panel sets get ignored.
- **Cross-panel alignment.** When a Header element needs to line up with a column inside the resizable workspace (e.g. ViewSwitcher aligning to FileTree), the chat `ResizablePanel` writes its live pixel width to `document.documentElement.style['--chat-panel-width']` via `onResize`, and the Header element uses `left: calc(var(--chat-panel-width) + offset)` absolute positioning.

## Tech

Vite 6, React 19, TypeScript 5.9, Tailwind v4 (@theme inline), shadcn/ui (new-york style, `components.json`) + radix-ui primitives, TanStack Router 1.95, TanStack Query 5.95, Zustand 5, better-auth/react, Monaco + xterm for workspace panels, lucide icons, `react-markdown` + `remark-gfm` + `react-syntax-highlighter`.

## Relationship

Frontend = orchestration + presentation. Backend owns persistence, agent execution, sandbox, quota, storage. Server messages arrive as JSONB-mirrored agent blocks (see `@code-artisan/shared`) and render without shape translation. SSE is the only bidirectional channel; everything else is plain REST under `/api/*`.
