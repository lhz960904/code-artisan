# Web AI Coding Agent — Design Spec

> Created: 2026-03-26
> Status: Draft → Pending Review

---

## 1. Overview

A browser-based AI coding agent: user describes a programming task, AI autonomously writes code in a sandboxed environment, executes it, and returns results in real-time. Users can view/edit code, continue the conversation, preview web apps, and deploy finished projects.

**Target**: Live by May 31, 2026. Resume highlight for job search.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────┐
│                   Tencent Cloud VPS               │
│                                                   │
│  ┌───────────┐   Nginx    ┌──────────────────┐   │
│  │  Frontend  │ ◄─reverse─► │  Hono (Node.js)  │   │
│  │  (static)  │   proxy   │  Backend Server   │   │
│  └───────────┘            └────────┬─────────┘   │
│                                    │              │
└────────────────────────────────────┼──────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              ┌──────────┐   ┌────────────┐   ┌──────────┐
              │ Supabase │   │  Claude    │   │   E2B    │
              │ DB+Auth  │   │  API      │   │  Sandbox │
              │+Realtime │   │(Opus 4.5) │   │          │
              └──────────┘   └────────────┘   └──────────┘
```

### Key decisions

- **Single VPS deployment**: Frontend static files + Node.js backend on one Tencent Cloud server, managed by Docker Compose + Nginx. No serverless time limits.
- **Monorepo**: pnpm workspace with `packages/frontend` + `packages/backend`, shared type definitions.
- **Task-driven model**: Agent loop runs independently of frontend connection. All events persisted to Supabase. Frontend subscribes via Supabase Realtime. Page close does not interrupt backend agent execution.
- **Supabase as single external data layer**: Auth, DB (Postgres), and Realtime push — no Redis or separate message queue needed.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Router | TanStack Router |
| Code Editor | Monaco Editor |
| Terminal Renderer | xterm.js |
| Backend | Hono.js (Node.js runtime) |
| AI Model | Claude API (claude-opus-4-5) |
| Sandbox | E2B |
| Database + Auth | Supabase (cloud) |
| Realtime Push | Supabase Realtime |
| ORM | Drizzle |
| Deployment | Tencent Cloud VPS, Docker Compose + Nginx |

---

## 4. Data Model

### Supabase Auth (built-in)

Using Supabase Auth with two providers:
- **Email OTP**: Passwordless, user receives verification code
- **GitHub OAuth**: Reuses the same GitHub App for future GitHub integration

No custom users table — reference `auth.users.id` directly.

### Tables

```sql
-- Conversations
conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id),
  title         text,                              -- AI-generated or user-edited
  mode          text DEFAULT 'yolo',               -- 'yolo' | 'confirm'
  sandbox_id    text,                              -- Current E2B sandbox ID, nullable
  deploy_url    text,                              -- Vercel deployment URL, nullable
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
)

-- Events (core table — all interactions are events)
events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid REFERENCES conversations(id),
  seq               serial,                        -- Auto-increment for ordering & reconnect
  type              text NOT NULL,                  -- See event types below
  data              jsonb NOT NULL,                 -- Type-specific payload
  created_at        timestamptz DEFAULT now()
)

-- File Snapshots (latest version per path per conversation)
file_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid REFERENCES conversations(id),
  path              text NOT NULL,
  content           text NOT NULL,
  updated_at        timestamptz DEFAULT now(),
  UNIQUE(conversation_id, path)
)

-- User Quotas
user_quotas (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id),
  total_tokens  bigint DEFAULT 1000000,            -- Initial free quota
  used_tokens   bigint DEFAULT 0
)
```

### Event Types

| type | data payload |
|------|-------------|
| `user_message` | `{ content: string }` |
| `ai_text` | `{ content: string }` — accumulated in chunks; backend buffers streaming tokens and writes/updates event periodically (e.g., every 200ms or on sentence boundary). Frontend sees INSERT then UPDATEs via Realtime. |
| `tool_call` | `{ tool: string, args: object }` |
| `tool_result` | `{ tool: string, output: string, error?: string }` |
| `confirm_required` | `{ tool: string, args: object, description: string }` |
| `confirm_response` | `{ approved: boolean }` |
| `preview_url` | `{ url: string, port: number }` |
| `error` | `{ message: string, code?: string }` |

---

## 5. Agent Loop

### Flow

```
User sends message
    │
    ▼
Backend writes event (type: "user_message")
    │
    ▼
Create / restore E2B sandbox
│  - sandbox_id exists & valid → reuse
│  - sandbox_id is null or expired → create new + restore files from file_snapshots
    │
    ▼
┌─── Agent Loop ──────────────────────────────────┐
│                                                  │
│  Call Claude API (tools + event history)          │
│       │                                          │
│       ├─ Text response → write event (ai_text)   │
│       │   → end loop                             │
│       │                                          │
│       └─ Tool call                               │
│            │                                     │
│            ▼                                     │
│       Write event (tool_call)                    │
│            │                                     │
│            ├─ YOLO mode → execute immediately     │
│            │                                     │
│            └─ Confirm mode                       │
│                 │                                │
│                 ▼                                │
│            Write event (confirm_required)        │
│            Pause — wait for confirm_response     │
│                 │                                │
│                 ├─ approved → execute             │
│                 └─ rejected → skip, continue     │
│                                                  │
│       Execute tool (E2B operation)               │
│            │                                     │
│            ▼                                     │
│       Write event (tool_result)                  │
│       If write_file → upsert file_snapshot       │
│            │                                     │
│            ▼                                     │
│       Loop back — call Claude again              │
│                                                  │
└──────────────────────────────────────────────────┘
```

### AI Tools

```
read_file(path)            → Read file content from sandbox
write_file(path, content)  → Write/overwrite file in sandbox
execute_command(cmd)       → Execute shell command, return stdout/stderr
list_files(path)           → List directory structure
```

### Sandbox Lifecycle

- Sandbox created on first message in a conversation, or when needed after expiry
- `sandbox_id` stored in conversations table
- On sandbox timeout/expiry: set `sandbox_id = null`
- On next tool execution: create new sandbox, restore all files from `file_snapshots`, resume
- During confirm wait: sandbox may expire — this is fine, will restore on approve

### Token Quota

- After each Claude API call, read `usage.input_tokens + usage.output_tokens` from response
- Accumulate to `user_quotas.used_tokens`
- Check balance before calling Claude; if insufficient, return error event

---

## 6. Execution Modes

### YOLO Mode
All tool calls execute immediately without user intervention. Agent loop runs to completion autonomously.

### Confirm Mode
Every tool call pauses for user approval before execution:
1. Backend writes `confirm_required` event
2. Frontend displays confirmation card (tool name, arguments, description)
3. User clicks Approve or Reject
4. Frontend POSTs to `/api/conversations/:id/confirm`
5. Backend writes `confirm_response` event, resumes or skips

---

## 7. Frontend

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Toolbar: Logo | Session Title | YOLO/Confirm | Preview | Deploy | Avatar │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  Chat      │  ┌─ File Explorer ─┬─ Monaco Editor ─┐ │
│  Panel     │  │                 │  (multi-tab)     │ │
│            │  │  project/       │                  │ │
│  - Messages│  │    main.py      │  [code content]  │ │
│  - Tool    │  │    utils/       │                  │ │
│    cards   │  │    ...          │                  │ │
│  - Confirm │  │                 ├──────────────────┤ │
│    cards   │  │                 │                  │ │
│            │  │                 │  Terminal Panel   │ │
│  [input]   │  │                 │  (xterm.js)      │ │
│            │  └─────────────────┴──────────────────┘ │
└────────────┴─────────────────────────────────────────┘
```

### Panel Interactions

| Event Type | Chat Panel | Editor | Terminal |
|-----------|-----------|--------|----------|
| ai_text | Render Markdown | — | — |
| tool_call: write_file | Collapsed card: "Wrote main.py" | Auto-open file, highlight changes | — |
| tool_call: execute_command | Collapsed card: "Ran python main.py" | — | Stream stdout/stderr |
| tool_call: read_file | Collapsed card: "Read config.json" | Auto-open file | — |
| confirm_required | Confirmation card with Approve/Reject | — | — |
| preview_url | Link to preview | — | — |

### Routes (TanStack Router)

```
/login              → Login page (Email OTP + GitHub OAuth)
/                   → Conversation list (history)
/chat/:id           → Main workspace (Chat + Editor + Terminal)
/preview/:id        → Sandbox web app preview (iframe to E2B exposed port)
```

### Realtime Subscription

- Frontend uses Supabase JS Client to subscribe to `events` table INSERT for current `conversation_id`
- Maintains `lastSeq` locally
- On page load / reconnect: `SELECT * FROM events WHERE conversation_id = ? AND seq > lastSeq ORDER BY seq`
- File tree updated from `list_files` tool_result events

---

## 8. API Design

```
POST   /api/conversations                  → Create conversation
GET    /api/conversations                  → List user's conversations
GET    /api/conversations/:id              → Get conversation detail
PATCH  /api/conversations/:id              → Update (title, mode)
POST   /api/conversations/:id/messages     → Send message (triggers agent loop)
POST   /api/conversations/:id/confirm      → User approve/reject a confirm_required
POST   /api/conversations/:id/deploy       → Deploy project to user's Vercel
GET    /api/user/quota                     → Query token quota
```

Auth: All endpoints require Supabase JWT in Authorization header. Backend validates via Supabase Admin SDK.

Realtime data (events, file changes) goes through Supabase Realtime subscriptions, not API polling.

---

## 9. Deploy Feature

### Live Preview (during development)
- E2B sandbox exposes ports for running web servers
- Agent detects port exposure → writes `preview_url` event
- Frontend shows preview via iframe or new tab
- Requires active sandbox — temporary, not permanent

### Production Deploy (user action)
- User connects Vercel account via OAuth (stored in Supabase)
- User clicks "Deploy" when satisfied with project
- Backend flow:
  1. Pull all project files from E2B sandbox (or file_snapshots if sandbox expired)
  2. Call Vercel API with user's OAuth token to create deployment
  3. Return permanent URL (e.g., `project-abc.vercel.app`)
  4. Store URL in `conversations.deploy_url`

### GitHub Integration (nice-to-have)
- Same GitHub OAuth used for login, request additional `repo` scope
- Export: Create GitHub repo from project files
- Import: Clone user's GitHub repo into E2B sandbox for AI-assisted development

---

## 10. Deployment

### Docker Compose

```yaml
services:
  backend:
    build: ./packages/backend
    ports:
      - "3001:3001"
    environment:
      - SUPABASE_URL
      - SUPABASE_SERVICE_KEY
      - CLAUDE_API_KEY
      - E2B_API_KEY

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./packages/frontend/dist:/usr/share/nginx/html
      - ./nginx.conf:/etc/nginx/nginx.conf
```

### Nginx Config (simplified)

```
/ → serve frontend static files
/api/* → proxy to backend:3001
```

### Server Requirements
- Tencent Cloud lightweight server, 2C4G recommended
- Docker + Docker Compose
- Domain + HTTPS (Let's Encrypt) — optional for MVP, can use IP initially

---

## 11. MVP Scope

### Must Have
- [x] Chat interface with Markdown rendering
- [x] Monaco Editor with multi-file tabs
- [x] File tree (from sandbox filesystem)
- [x] Terminal panel with ANSI support (xterm.js)
- [x] AI Agent loop with 4 tools (read_file, write_file, execute_command, list_files)
- [x] YOLO / Confirm execution modes
- [x] Streaming AI responses via Supabase Realtime
- [x] Supabase Auth (Email OTP + GitHub OAuth)
- [x] Conversation history persistence
- [x] File snapshot & sandbox recovery
- [x] Token quota per user
- [x] Live preview (E2B port exposure)
- [x] Deploy to Vercel (user's account via OAuth)
- [x] Docker Compose deployment

### Nice-to-Have (time permitting)
- [ ] GitHub export (create repo from project)
- [ ] GitHub import (clone repo into sandbox)
- [ ] Code diff view
- [ ] Share conversation link
- [ ] Payment / top-up for extra quota
- [ ] Language/runtime selection (Python / Node)
