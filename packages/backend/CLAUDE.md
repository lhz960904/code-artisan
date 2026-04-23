# @code-artisan/backend

Hono HTTP+WS server orchestrating agent conversations. Thin routes delegate to services; `AgentTurnService` drives `@code-artisan/agent`, persists messages/snapshots to Postgres (Drizzle), and streams events over SSE. A parallel WebSocket gateway (`/api/conversation-ws`) owns PTY-backed shell sessions — agent backgrounded commands and user-spawned terminals share the same manager. Message model mirrors the agent package end-to-end (JSONB polymorphic blocks) — attachments live in `metadata` and are expanded into `image_url` / `file` blocks at agent run-time.

## Structure

```text
src/
  index.ts              Hono app, route registration, better-auth handler, WS upgrade, SPA fallback, health check
  env.ts                Zod-validated env
  auth.ts               better-auth instance (GitHub OAuth provider)
  db/
    schema.ts           better-auth tables (user, session, account, verification) + business tables:
                          conversations (+ title, mode, sandboxId, deployUrl, agentRunning),
                          messages (JSONB content + metadata), fileSnapshots, userQuotas, settings (KV)
    index.ts            pg pool + drizzle client
  http/                 Transport helpers — keep routes thin
    response.ts         ok/created/noContent/badRequest/unauthorized/forbidden/notFound/conflict/serverError
    status.ts           HttpStatusCode enum
    error-handler.ts    Global error catcher + 404 handler
    validator.ts        Zod param/json/query validation
  middlewares/
    require-auth.ts     Hono middleware: validates better-auth session, sets `c.get("user")`
  prompts/
    sections.ts         WEB_IDENTITY + buildEnvironmentSection(workspaceRoot)  — sandbox-aware env section
    index.ts            buildWebSystemPrompt() = composeSystemPrompt({ identity, environment })
  routes/               Thin wrappers: validate → delegate to service
    conversation.ts     CRUD conversations
    message.ts          GET /message/:id (list), POST /message/:id — validates `model` against SUPPORTED_MODELS,
                          fires title generation in parallel, streams AgentTurnService output over SSE, appends
                          `title_update` after the run if a title was minted
    snapshot.ts         File snapshots CRUD
    attachment.ts       POST /attachment — multipart upload → Supabase Storage → { fileId, fileName, mimeType, size }
    user.ts             Profile
    setting.ts          Per-user KV settings (drives MCP installed list via "mcp" key)
    models.ts           GET /models — public (registered BEFORE requireAuth); returns the SUPPORTED_MODELS catalog
    conversation-ws.ts  WS /ws?conversationId=... — PTY terminals (hello/attach/detach/create/input/resize/kill),
                          does its own auth via `auth.api.getSession` + conversation ownership check
  services/             Business logic
    agent-turn.ts       AgentTurnService(conversation, { model }) — async generator; acquires sandbox, runs agent,
                          streams events, persists messages + snapshots, drains pendingEvents side channel
    generate-title.ts   maybeGenerateTitle(conversation, userMessage, modelId) — concurrency-safe
                          (UPDATE ... WHERE title IS NULL RETURNING); returns title or null
    conversation-sandbox.ts  acquireConversationSandbox(conversationId, sandboxId) — reconnect or create E2B
                               sandbox, restore snapshots in bulk on cold starts, persist sandboxId on new sandbox
    storage.ts          Supabase bucket I/O: uploadFile / getFileBuffer / getPublicUrl (10MB cap)
    middlewares/        Agent-run middlewares (not Hono)
      check-quota.ts       beforeAgentRun + before/afterModel — pushes `quota_exceeded` via side channel,
                             sets `shouldStop` when exhausted
      track-file-changes.ts File tracker — seeds manifest in parallel with user msg insert, diffs after each
                             tool use, streams file_update/file_delete, persists final manifest via onPersist
    web-tools/          Backend-owned tools that replace the agent-package's `bash` for web runs
      bash.ts              Foreground via `sandbox.exec`; `run_in_background: true` → spawn PTY session, return id
      bash-output.ts       Poll a backgrounded session's pending output + status
      kill-shell.ts        Terminate a session by id
      expose-port.ts       `sandbox.getHost(port)` → register PreviewState keyed by sandboxId, bound to session_id
                             so preview auto-clears on session exit
      index.ts
    shell-session/      PTY-backed long-running process manager
      manager.ts           ShellSessionManager — create/list/get/sendInput/resize/kill; subscribeConversation
                             (session_started/session_ended); per-sandbox PreviewState set/get/clear
      session.ts           ShellSession — wraps E2B PTY, pipes onData/onExit into a listener bus + ring buffer
      ring-buffer.ts       Capped byte ring for scrollback on reattach
      types.ts             SessionMeta / SessionEvent / SessionOwner ("agent" | "user") / TailResult / Unsubscribe
      index.ts             Re-exports + getShellSessionManager() singleton
  utils/
    message.ts          buildUserMessage (text + metadata.attachments) / buildAgentMessages (expands attachments → image_url | file blocks)
  mcp/
    mcp-registry.json   Static catalog of available MCP servers (loaded by setting.ts)
    mcp-tools.ts        McpToolSet — connects MCP servers over stdio, wraps tools via defineTool (defined; not currently wired into AgentTurnService)
  sandbox/
    e2b-sandbox.ts      E2BSandbox — implements agent Sandbox interface on top of @e2b/code-interpreter; exposes `pty` + `sdk`
    provider.ts         Sandbox pool manager (acquire / release)
    index.ts            getSandboxPool()
test/                   Vitest
drizzle.config.ts
```

## Routing

- `/api/auth/*` → better-auth handler (sign-in, callback, session).
- `/api/conversation-ws/ws` (WebSocket) and `/api/models` are registered **before** `requireAuth`: the WS gateway does its own session check in the upgrade path; `/api/models` is public (the catalog is non-sensitive).
- `requireAuth` guards everything under `/api/*` registered afterwards (conversation, message, snapshot, attachment, user, setting).
- Static SPA at `./dist/public` with `index.html` fallback for non-API routes.
- Bun WebSocket wiring: `export default { fetch, websocket, idleTimeout }` with Hono's `upgradeWebSocket` helper.

## Turn flow (POST /message/:conversationId)

Request body: `{ content, attachments?, model }` — `model` is required and zod-validated against `SUPPORTED_MODELS.id`.

1. Route validates params/body → loads conversation → instantiates `AgentTurnService(conversation, { model })`.
2. `buildUserMessage(content, attachments)` — attachments stay in `metadata`, never duplicated into `content`.
3. Route fires `maybeGenerateTitle(conversation, userMessage, model)` in parallel with the agent run; a swallowed-on-error promise awaited after the stream drains.
4. Service runs in parallel: insert user message, rebuild agent-shape `Message[]` from JSONB (expanding attachments), `acquireConversationSandbox` (reconnect or fresh E2B + bulk snapshot restore on cold starts).
5. Yields `user_message_saved { messageId }` so the frontend can swap its optimistic id for the DB row id.
6. Builds agent once per service instance (AnthropicProvider keyed by `turnOptions.model`) with middlewares: `microCompact`, `autoCompact` (persists compacted summary as its own message on fire), `checkQuota` (pushes `quota_exceeded` into pendingEvents), `fileTracker` (pushes `file_update`/`file_delete` into pendingEvents, persists final manifest via `onPersist`). Tools: `createWebBashTool` + `createBashOutputTool` + `createKillShellTool` + `createExposePortTool` (all share the shell-session manager singleton), `webSearchTool`, `webFetchTool`. `loop-detection` + `todo` come from `createAgent` defaults (`skills` explicitly disabled via `skillsDirs: []`). `prompt: buildWebSystemPrompt()`.
7. For each agent event:
   - Drain `pendingEvents` first (middleware side channel for quota/file events).
   - `partial` — lazily mint one `assistantMessageId` per turn via `randomUUID()`, attach to every partial + the final assistant `message`. Tool messages get their own fresh id.
   - `message` — persist to DB with that id, yield to SSE.
8. Heartbeat every 15s (`streamSSE`). On error → yield `{ type: "error", message }`. On `shouldStop` → loop exits cleanly, no throw.
9. After the stream drains, the awaited title promise emits `title_update` if a new title was minted.
10. `fileTracker.afterAgentRun` upserts final snapshot manifest (delete rows no longer present).

## Shell sessions & preview

- `ShellSessionManager` is a singleton (`getShellSessionManager()`) shared by the agent's `bash(run_in_background: true)`, `bash_output`, `kill_shell`, and the WS gateway's user-spawned terminals. Sessions have `owner: "agent" | "user"`.
- Each session wraps an E2B PTY; `onData` chunks fan out to per-session listeners + a capped ring buffer (`DEFAULT_BUFFER_BYTES = 64 KiB`) for scrollback on reattach.
- `PreviewState` is keyed by **sandboxId** (not conversationId) so it lives exactly as long as the E2B sandbox does — survives reloads (read back via conversation detail → `previewUrl`), dies on sandbox eviction. `expose_port` binds a `sessionId` to it; when that session exits, the preview auto-clears.
- `subscribeConversation` lets a single WS connection follow the full session lifecycle for its conversation (session_started / session_ended).

## WS protocol (/api/conversation-ws/ws)

Client → server: `hello | attach | detach | create | input | resize | kill`. On `attach`, the server sends a `snapshot` (tail bytes + nextOffset) then streams `data` frames per byte chunk; on exit emits `{op: "exit"}`. `create` flows a `draftId` back via `created { draftId, meta }` (or `create_failed`) so the UI can swap the client-side draft for the server-minted session id.

## WebAgentEvent

```text
{ type: "user_message_saved", messageId }
| { type: "partial", message: AssistantMessage, messageId }
| { type: "message", message: AssistantMessage | ToolMessage, messageId }
| { type: "title_update", title }
| { type: "file_update", files: Array<{ path, content }> }
| { type: "file_delete", paths: string[] }
| { type: "quota_exceeded" }
| { type: "error", message: string }
```

## Conventions

- **Routes stay thin**: validate + delegate. Orchestration lives in `services/agent-turn.ts`.
- **Response helpers** (`http/response.ts`) return structured `{ statusCode, data, message }` — don't call `c.json` directly.
- **Unified message model**: DB JSONB mirrors agent-package block shapes. `buildAgentMessages()` expands `metadata.attachments` into `image_url` / `file` blocks at run-time so the stored shape never duplicates file bytes.
- **Server-minted message ids** — one UUID per turn is shared across the turn's `partial` + final `message` events. Frontend keys UI state by this id from birth.
- **Cooperative stop over exceptions**: quota/loop signal via `shouldStop`, not throws.
- **Agent middlewares, not Hono middlewares**, for agent-run concerns. Hono-layer concerns (auth) live under `middlewares/`.
- **Sandbox injection**: E2B only — Agent stays environment-agnostic; backend owns the sandbox lifecycle + pool. `acquireConversationSandbox` is the single entry point for both the agent turn and the terminal WS so a cold sandbox always restores snapshots first.
- **Title generation is best-effort and parallel**: never blocks the stream; concurrency-safe via `WHERE title IS NULL RETURNING`.
- **Model routing**: `/api/message/:id` and `/api/models` are driven by `SUPPORTED_MODELS` in `@code-artisan/shared`. `AnthropicProvider` is instantiated per-turn with the requested model id.
- **Tool overrides**: backend's `bash` (PTY-capable) replaces the agent package's builtin `bash` by name-match inside `createAgent`. Pair it with `bash_output` + `kill_shell` + `expose_port`.
- **File tracking**: sha256 manifest + `-newer` incremental scan; baseline seeded in parallel with the first message insert; write-tool paths tracked directly, `bash` triggers full reconcile. Out-of-workspace writes ignored.
- **Folder-per-module**; class only where stateful (`AgentTurnService`, `ShellSessionManager`, `ShellSession`, `McpToolSet`).

## Tech

Bun + Hono 4 (including `hono/bun` websocket + `upgradeWebSocket`), Drizzle + Postgres, Zod + `@hono/standard-validator`, `better-auth`, `@code-artisan/agent` (workspace), `@code-artisan/shared` (workspace), `@supabase/supabase-js`, `@e2b/code-interpreter` (PTY API), `@modelcontextprotocol/sdk`, vitest.

## Relationship

Backend = integration layer. The agent package stays environment-agnostic; backend supplies sandbox, persistence, quota, file tracking, title generation, PTY-backed long-running processes, preview exposure, and SSE + WS transports. Shared message shapes flow through JSONB without translation loss — `metadata.attachments` is the single source for user uploads, expanded on read. MCP tool bridging exists in code but is not currently wired into agent runs.
