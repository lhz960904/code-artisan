# @code-artisan/backend

Hono HTTP server orchestrating agent conversations. Thin routes delegate to services; `AgentTurnService` is the central runner that drives `@code-artisan/agent`, persists messages/snapshots to Postgres (Drizzle), and streams events over SSE. Message model mirrors the agent package end-to-end (JSONB polymorphic blocks) — attachments live in `metadata` and are expanded into `image_url` / `file` blocks at agent run-time.

## Structure

```text
src/
  index.ts              Hono app, route registration, better-auth handler, SPA fallback, health check
  env.ts                Zod-validated env
  auth.ts               better-auth instance (GitHub OAuth provider)
  db/
    schema.ts           better-auth tables (user, session, account, verification) + business tables
                          (conversations, messages JSONB, fileSnapshots, userQuotas, settings KV)
    index.ts            pg pool + drizzle client
  http/                 Transport helpers — keep routes thin
    response.ts         ok/created/noContent/badRequest/unauthorized/forbidden/notFound/conflict/serverError
    status.ts           HttpStatusCode enum
    error-handler.ts    Global error catcher + 404 handler
    validator.ts        Zod param/json/query validation
  middlewares/
    require-auth.ts     Hono middleware: validates better-auth session, sets `c.get("user")`
  routes/               Thin wrappers: validate → delegate to service
    conversation.ts     CRUD conversations
    message.ts          GET /message/:id (list), POST /message/:id (SSE stream via AgentTurnService)
    snapshot.ts         File snapshots CRUD
    attachment.ts       POST /attachment — multipart upload → Supabase Storage → { fileId, fileName, mimeType, size }
    user.ts             Profile
    setting.ts          Per-user KV settings (drives MCP installed list via "mcp" key)
  services/             Business logic
    agent-turn.ts       AgentTurnService — async generator; sets up agent, streams events, persists messages + snapshots, emits WebAgentEvent union
    storage.ts          Supabase bucket I/O: uploadFile / getFileBuffer / getPublicUrl (10MB cap)
    middlewares/        Agent-run middlewares (not Hono)
      check-quota.ts       beforeModel/afterModel — sets shouldStop when quota exhausted
      track-file-changes.ts File tracker — seeds manifest, diffs after each tool use, streams file_update/file_delete, persists final manifest
  utils/
    message.ts          buildUserMessage (text + metadata.attachments) / buildAgentMessages (expands attachments → image_url | file blocks)
  mcp/
    mcp-registry.json   Static catalog of available MCP servers (loaded by setting.ts)
    mcp-tools.ts        McpToolSet — connects MCP servers over stdio, wraps tools via defineTool (defined; not currently wired into AgentTurnService)
  sandbox/
    e2b-sandbox.ts      E2BSandbox — implements agent Sandbox interface on top of @e2b/code-interpreter
    provider.ts         Sandbox pool manager (acquire / release)
    index.ts            getSandboxPool()
test/                   Vitest
drizzle.config.ts
```

## Routing

- `/api/auth/*` → better-auth handler (sign-in, callback, session).
- `requireAuth` guards everything under `/api/*` below the auth handler.
- Static SPA at `./dist/public` with `index.html` fallback for non-API routes.

## Turn flow (POST /message/:conversationId)

1. Route validates params/body → instantiates `AgentTurnService(conversation)`.
2. `buildUserMessage(content, attachments)` — attachments stay in `metadata`, never duplicated into `content`.
3. Service runs in parallel: insert user message, rebuild agent-shape `Message[]` from JSONB (expanding attachments), acquire E2B sandbox + restore file snapshots.
4. Yields `user_message_saved { messageId }` so the frontend can swap its optimistic id for the DB row id.
5. Builds agent once per service instance with middlewares: `microCompact`, `autoCompact` (persists compacted summary as its own message on fire), `checkQuota` (pushes `quota_exceeded` into pendingEvents), `fileTracker` (pushes `file_update`/`file_delete` into pendingEvents, persists final manifest via `onPersist`). Tools: `webSearchTool`, `webFetchTool`. `loop-detection` + `todo` + `skills` come from `createAgent` defaults.
6. For each agent event:
   - Drain `pendingEvents` first (middleware side-channel for quota/file events).
   - `partial` — lazily mint one `assistantMessageId` per turn via `randomUUID()`, attach to every partial + the final assistant `message`. Tool messages get their own fresh id.
   - `message` — persist to DB with that id, yield to SSE.
7. Heartbeat every 15s (`streamSSE`). On error → yield `{ type: "error", message }`. On `shouldStop` → loop exits cleanly, no throw.
8. `fileTracker.afterAgentRun` upserts final snapshot manifest (delete rows no longer present).

## WebAgentEvent

```
{ type: "user_message_saved", messageId }
| { type: "partial", message: AssistantMessage, messageId }
| { type: "message", message: AssistantMessage | ToolMessage, messageId }
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
- **Sandbox injection**: E2B only — Agent stays environment-agnostic; backend owns the sandbox lifecycle + pool.
- **File tracking**: sha256 manifest + `-newer` incremental scan; write-tool paths tracked directly, `bash` triggers full reconcile. Out-of-workspace writes ignored.
- **Folder-per-module**; class only where stateful (`AgentTurnService`, `McpToolSet`).

## Tech

Bun + Hono 4, Drizzle + Postgres, Zod + `@hono/standard-validator`, `better-auth`, `@code-artisan/agent` (workspace), `@code-artisan/shared` (workspace), `@supabase/supabase-js`, `@e2b/code-interpreter`, `@modelcontextprotocol/sdk`, vitest.

## Relationship

Backend = integration layer. The agent package stays environment-agnostic; backend supplies sandbox, persistence, quota, file tracking, and SSE transport. Shared message shapes flow through JSONB without translation loss — `metadata.attachments` is the single source for user uploads, expanded on read. MCP tool bridging exists in code but is not currently wired into agent runs.
