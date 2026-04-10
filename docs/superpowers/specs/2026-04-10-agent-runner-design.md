# Agent Runner Design Spec

## Overview

Agent-in-sandbox architecture: each conversation runs an isolated agent inside an E2B sandbox. The backend becomes a thin orchestration layer (DB persistence, SSE relay, sandbox lifecycle). The agent SDK stays pure (no sandbox awareness).

## Architecture

```
Frontend ←SSE→ Backend (Hono) ←HTTP SSE→ E2B Sandbox (agent-runner)
```

- **Frontend**: React, unchanged
- **Backend**: Hono server — DB persistence, SSE relay to frontend, sandbox lifecycle management
- **agent-runner**: Hono HTTP server inside E2B sandbox — receives invoke requests, runs agent, streams results back
- **agent SDK**: `@code-artisan/agent` — pure ReAct loop, tools use native Bun APIs

## Data Flow

### User Sends Message

1. Frontend → `POST /api/conversations/:id/messages` → Backend
2. Backend writes user message to DB, sets `agentRunning = true`
3. Backend → `POST http://<sandbox-host>/invoke` with `{ message, history, files, config }`
4. agent-runner creates Agent, calls `invoke()`, yields messages as SSE events
5. Backend receives each event → writes to DB + relays SSE to Frontend
6. On `done` event → Backend sets `agentRunning = false`

### User Stops Agent

1. Frontend → `POST /api/conversations/:id/stop` → Backend
2. Backend → `POST http://<sandbox-host>/stop`
3. agent-runner aborts agent, returns confirmation
4. Backend sets `agentRunning = false`

### Sandbox Rebuild (after timeout/crash)

1. Backend detects sandbox unavailable (health check fails)
2. Creates new E2B sandbox, waits for agent-runner to start (poll `/health`)
3. Next `POST /invoke` includes `files[]` (from DB file_snapshots) + `history[]`
4. agent-runner restores files to disk, then runs agent with history
5. Backend updates `conversations.sandboxId`

## Agent-Runner API

### `POST /invoke`

Request:
```json
{
  "message": { "role": "user", "content": [{ "type": "text", "text": "..." }] },
  "history": [],
  "files": [
    { "path": "/home/user/app/index.ts", "content": "..." }
  ],
  "config": {
    "model": "claude-sonnet-4-20250514",
    "apiKey": "sk-ant-...",
    "prompt": "You are a coding assistant...",
    "maxSteps": 100
  }
}
```

Response: SSE stream with events:
- `{"type":"assistant","message":{...}}` — assistant message (text, thinking, tool_use)
- `{"type":"tool","message":{...}}` — tool result
- `{"type":"file","path":"...","content":"..."}` — file written (runner intercepts write_file)
- `{"type":"done","usage":{"inputTokens":N,"outputTokens":N}}` — agent finished
- `{"type":"error","error":"..."}` — agent error

Returns `409 Conflict` if an agent is already running.

### `POST /stop`

Request: empty body
Response: `{ "ok": true }`

Aborts the running agent. Returns `{ "ok": false }` if no agent is running.

### `GET /health`

Response: `{ "status": "ok" }`

## Package Structure

```
packages/agent-runner/
├── package.json          # deps: @code-artisan/agent, hono
├── tsconfig.json
├── index.ts              # Hono server entry, listen on port 3000
├── routes/
│   └── agent.ts          # /invoke, /stop, /health endpoints
└── services/
    └── file-tracker.ts   # Intercept write_file tool calls, track modified files
```

Dependencies: `@code-artisan/agent`, `hono`. No DB, no Supabase, no E2B SDK.

## File Tracking

agent-runner intercepts the agent's yield output:
1. When AssistantMessage contains `tool_use` with `name: "write_file"`, record `{ path, content }` keyed by `tool_use_id`
2. When ToolMessage returns with matching `tool_use_id` and result "OK", emit `file` SSE event
3. This is purely runner logic — agent SDK is unaware

## Sandbox Lifecycle (Backend Side)

- `conversations.sandboxId` stores the current sandbox ID
- On message send: check sandboxId → health check → invoke or rebuild
- On rebuild: E2B create → poll /health → invoke with files[] + history[] → update sandboxId
- On conversation delete: E2B kill sandbox
- Concurrency: one agent per sandbox at a time (409 on conflict, matches existing `agentRunning` flag)

## Backend Migration

Backend drops its own agent implementation (`backend/src/agent/`). Replaces with:
1. HTTP client to agent-runner (POST /invoke → consume SSE)
2. SSE relay: parse runner events → write DB → emit to frontend EventBus
3. Sandbox lifecycle: acquire/health-check/rebuild using E2B SDK
4. Keep existing: conversations CRUD, upload, MCP server config, user quotas

## Responsibilities

| Layer | Owns | Does NOT own |
|---|---|---|
| agent SDK | ReAct loop, tools, middlewares, LLM provider | Sandbox, DB, HTTP, file tracking |
| agent-runner | HTTP server, SSE serialization, file tracking | DB, sandbox lifecycle, user auth |
| backend | DB persistence, SSE relay, sandbox lifecycle, auth | Agent logic, tool execution |

## E2B Sandbox Image

Pre-install: `bun`, `@code-artisan/agent`, `@code-artisan/agent-runner`.
Entry: `bun run /app/node_modules/@code-artisan/agent-runner/index.ts`
Port: 3000 (exposed via E2B `getHost()`)
