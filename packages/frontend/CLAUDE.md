# @code-artisan/frontend

Vite + React 19 SPA that drives the agent from a workspace-style UI. TanStack Router owns route tree and auth guards; TanStack Query owns server cache; Zustand owns ephemeral cross-page state (live workspace files + draft prompts). Chat streams over SSE from the backend and mirrors tool calls into editor / terminal / preview panels.

## Structure

```text
src/
  main.tsx, app.tsx      Entry; wires QueryClient, ThemeProvider, TanStack router
  index.css              Tailwind v4 @theme tokens (shadcn CSS-variable convention) + light/dark themes + Miro-aligned palette
  api/
    client.ts            apiFetch wrapper — credentials:include, 401 → /login redirect, unwraps { data }
    queries/             TanStack Query query options (conversations, messages, snapshots, quota, mcp-servers)
    queries/index.ts     Re-exports + queryFn helpers used directly (e.g. fetchConversationMessages)
    mutations/           useConversationCreate/Update/Delete, uploadFile, mcp-server mutations
    mutations/upload.ts  Public (no-auth) POST /api/attachment returning Attachment metadata
  components/
    ui/                  shadcn primitives (button, textarea, dialog, dropdown-menu, tabs, tooltip, …)
    common/              Logo, MarkdownRenderer, ThemeToggle
    layout/              HomeHeader, Header (in-app), AppSidebar, UserProfile
    chat/
      sender.tsx         Unified prompt input (default / large); PlusMenu + ModelPicker via DropdownMenu; drag/paste/pick attachments
      attachment-preview.tsx  Chips; File OR already-uploaded Attachment metadata
      chat-panel.tsx     Chat column: renders messages, mirrors assistant side-effects into workspace store, consumes pending-prompt store on mount for auto-send
      message-bubble.tsx, tool-call-item.tsx
    workspace/
      workspace-layout.tsx Header + ChatPanel (left 400px) + RightPanel (flex-1)
      right-panel.tsx    Tabs over editor-panel / file-tree / terminal-panel / preview-panel
  hooks/
    use-chat.ts          SSE consumer; exposes { messages, status, sendMessage, stop, error }
    use-file-upload.ts   Selected-file lifecycle; each addFiles triggers an immediate background upload — state: uploading → done/error
    use-start-conversation.ts Shared "create conversation + navigate" flow (auth gate + store stash)
  stores/
    workspace.ts         Live in-session workspace state (files map, open tabs, terminal, preview URL) — mutated by chat-panel side-effect loop
    pending-prompt.ts    Cross-page prompt handoff: draft slot (Home→Dashboard, JSON-persisted via sessionStorage to survive GitHub OAuth) + byConversationId (Dashboard→chat), shape { prompt, attachments: Attachment[] }
  contexts/theme-context.tsx  light/dark/system toggle stored in localStorage
  lib/
    auth-client.ts       better-auth/react client + getSession
    utils.ts             cn = clsx + tailwind-merge
  pages/
    layout/root.tsx      Root route + RouterContext (queryClient)
    layout/authed.tsx    Session gate; redirect to /login with ?redirect=
    home.tsx             Public landing; animated typing placeholder
    login.tsx            GitHub OAuth (other providers disabled)
    dashboard.tsx        Authed hub; consumes draft on mount (pre-fills sender), lists conversations
    chat.tsx             /chat/:conversationId — loader prefetches detail/messages/snapshots/quota
public/, index.html, vite.config.ts, components.json (shadcn), eslint.config.js
```

## Flows

**Submit from Home / Dashboard.** `useStartConversation.start(prompt, attachments: Attachment[])` → `getSession()`. Unauth → `setDraft({prompt, attachments})` (sessionStorage + Zustand) → `/login?redirect=/dashboard`. Auth → `useConversationCreate` → `setForConversation(id, …)` → `/chat/$conversationId`. Attachments were already uploaded when the user dropped/pasted them (public endpoint), so `start` only ferries serialisable metadata — OAuth full-page redirect is safe.

**Home → login → dashboard resume.** Dashboard mounts → `consumeDraft()` → if present, push prompt into Sender's controlled `value` and seed fileUpload via `seedUploaded(attachments)`. User sees the restored input and still clicks Start themselves (no auto-fire).

**Chat turn.** `chat.tsx` loader ensures detail/messages/snapshots/quota caches → `WorkspaceLayout` → `ChatPanel` mounts `useChat(conversationId, …)`. On first `status==="ready"`, consumes `byConversationId` and calls `sendMessage(prompt, attachments)` once. `sendMessage` POSTs to `/api/message/:id` and parses SSE frames into optimistic StoredMessages; the mirroring effect watches `messages` and translates `write_file` / `read_file` / `bash` tool calls + `previewUrl` metadata into `useWorkspaceStore` mutations so RightPanel reflects the agent's state live.

**File attachment.** Sender's drag/paste/pick → `fileUpload.addFiles(files)` → state entry per file transitions `uploading → done` as each `POST /api/attachment` resolves. Consumers read `fileUpload.attachments: Attachment[]`. `isUploading` drives Sender's disabled state.

## Conventions

- **Routes are first-class exports.** Each page file exports its own `createRoute(...)`; `app.tsx` assembles the tree. Auth gate lives on `authedRoute.beforeLoad`, not inside pages.
- **Data fetching = TanStack Query.** Queries defined as `*Options()` factories in `api/queries/`; pages use `useSuspenseQuery(xxxOptions())`. Mutations are hook wrappers invalidating the right keys.
- **Ephemeral state = Zustand.** Never persist live workspace state to server; the backend owns the source of truth. Stores live under `src/stores/`.
- Use **`apiFetch`** for typed `/api/*` calls. It strips the `{ data }` envelope, centralises 401 redirect, and always sends cookies.
- **Sender is presentational.** Callers own submission side-effects (navigation, upload kick-off is internal to the hook). Controlled mode (`value` + `onChange`) is used wherever the page needs to pre-fill.
- **Naming.** Spell out identifiers (conversation, not conv; message, not msg). Hooks are `useX`; stores are `useXStore`.
- **Theming.** Tailwind v4 `@theme inline` + HSL CSS variables (`--background`, `--ring`, pastel slots). `cn()` merges. Primary button color flows from `--primary`; shadcn primitives follow shadcn's data-attribute conventions.

## Tech

Vite 6, React 19, TypeScript 5.9, Tailwind v4 (@theme inline), shadcn/ui (new-york style, `components.json`) + radix-ui primitives, TanStack Router 1.95, TanStack Query 5.95, Zustand 5, better-auth/react, Monaco + xterm for workspace panels, lucide icons, `react-markdown` + `react-syntax-highlighter`.

## Relationship

Frontend = orchestration + presentation. Backend owns persistence, agent execution, sandbox, quota, storage. Server messages arrive as JSONB-mirrored agent blocks (see `@code-artisan/shared`) and render without shape translation. SSE is the only bidirectional channel; everything else is plain REST under `/api/*`.
