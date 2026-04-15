# @code-artisan/backend

Hono HTTP server orchestrating agent conversations. Thin routes delegate to services; `AgentTurnService` is the central runner that drives `@code-artisan/agent`, persists messages/snapshots to Postgres (Drizzle), and streams events over SSE. Message model mirrors the agent package end-to-end (JSONB polymorphic blocks).

## Structure

```text
src/
  index.ts              Hono app, route registration, SPA fallback, health check
  env.ts                Zod-validated env
  db/
    schema.ts           conversations, messages (JSONB content), fileSnapshots, userQuotas, settings
    index.ts            pg pool + drizzle client
  http/                 Transport helpers — keep routes thin
    response.ts         ok/created/noContent/badRequest/unauthorized/forbidden/notFound/conflict/serverError
    status.ts           HttpStatusCode enum
    error-handler.ts    Global error catcher
    validator.ts        Zod param/json/query validation
  routes/               Thin wrappers: validate → delegate to service
    conversation.ts     CRUD conversations
    message.ts          POST /message/:conversationId — SSE stream via AgentTurnService
    snapshot.ts         File snapshots CRUD
    attachment.ts       Upload/download
    user.ts             Profile
    setting.ts          Per-user KV settings
  services/             Business logic
    agent-turn.ts       AgentTurnService — async generator; sets up agent, streams events, persists messages + snapshots, emits WebAgentEvent union (message | error | quota_exceeded | done)
    message-store.ts    Message CRUD + snapshot upsert by (conversationId, path)
    quota.ts            Per-user quota enforcement
    storage.ts          File buffer I/O
    middlewares/
      check-quota.ts    Agent middleware (beforeModel/afterModel) — sets shouldStop when quota exhausted
  mcp/
    mcp-tools.ts        MCP server → FunctionTool via defineTool
  sandbox/
    e2b-sandbox.ts      E2B Sandbox impl injected into Agent
    provider.ts         Sandbox pool manager
test/                   Vitest
drizzle.config.ts
```

## Flow (POST /message/:conversationId)

1. Route validates → instantiates `AgentTurnService`.
2. Service loads stored messages, rebuilds agent-shape `Message[]` from JSONB, acquires E2B sandbox from pool, restores files from snapshots.
3. Builds tools (builtins + MCP-wrapped) and middlewares (`check-quota`, `loop-detection`, `micro-compact`, `auto-compact`).
4. Drives `agent.stream()` → each event persisted via `message-store` → yielded as SSE `WebAgentEvent`.
5. Heartbeat every 15s. On `shouldStop` (quota/loop): graceful `done` event, no throw.
6. Post-run: file snapshots upserted.

## Conventions

- **Routes stay thin**: validate + delegate. Orchestration lives in `services/agent-turn.ts`.
- **Response helpers** (`http/response.ts`) return structured `{ statusCode, data, message }` — don't call `c.json` directly.
- **Unified message model**: DB JSONB mirrors agent-package block shapes; `buildAgentMessages()` bridges stored ↔ live. Validate with Zod at persist time.
- **Cooperative stop over exceptions**: quota/loop signal via `shouldStop`, not throws.
- **Agent middlewares, not Hono middlewares**, for agent-run concerns (quota lives in `services/middlewares/`, wired into `AgentTurnService`).
- **Sandbox injection**: E2B only — Agent stays environment-agnostic; backend owns the sandbox lifecycle.
- **Folder-per-module**; class only where stateful (`AgentTurnService`, `MessageStore`).

## Tech

Bun + Hono 4, Drizzle + Postgres, Zod + `@hono/standard-validator`, `@code-artisan/agent` (workspace), `@code-artisan/shared` (workspace), `@supabase/supabase-js`, `@e2b/code-interpreter`, vitest.

## Relationship

Backend = integration layer. The agent package stays environment-agnostic; backend supplies sandbox, persistence, quota, MCP bridging, and SSE transport. Shared message shapes flow through JSONB without translation loss.
