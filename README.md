<div align="center">
  <img src="./packages/frontend/public/favicon.svg" alt="CodeArtisan" width="84" height="84" />

# CodeArtisan

A web AI coding agent — a personal learning project exploring how to build a hand-rolled agent SDK, sandboxed code execution, and a real workspace UI end-to-end.

[English](./README.md) · [简体中文](./README.zh-CN.md)

  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
    <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node" />
  </p>
</div>

## 🎬 Demo

https://github.com/user-attachments/assets/449acf6a-e12d-4dd5-a826-5ae6d825d68a

## ✨ Features

- **Hand-rolled Agent SDK.** Not a wrapper around the AI SDK or LangChain. A first-principles ReAct loop with pluggable providers, middleware, tools, and a sandbox interface. Block-based polymorphic message model flows end-to-end without translation loss.
- **Sandboxed by default.** Each conversation runs in an isolated [E2B](https://e2b.dev) sandbox. File snapshots restore on cold reconnect, so the workspace survives reloads.
- **MCP-native.** Install Model Context Protocol servers from a built-in marketplace; the agent picks them up on the next turn.
- **Live preview.** `expose_port` streams a sandboxed dev server straight into an in-browser iframe — no tunnels, no manual setup.
- **Real workspace UI.** Monaco editor, PTY-backed xterm terminals (agent and user share the same session manager), file tree + grep, all over a single conversation-scoped WebSocket.
- **Dual-transport streaming.** SSE for the per-turn agent output, persistent WebSocket for bidirectional terminal I/O.
- **Middleware system.** Quota tracking, file-change diffing, loop detection, micro-compact, auto-compact, plan-scoped todos. Add your own with one function.
- **Theming.** Tailwind v4 `@theme` tokens, light + dark.

## 🏛️ Architecture

<p align="center">
  <img src="./docs/screenshots/architecture.svg" alt="System architecture" width="1100" />
</p>

### Monorepo

| Package | What it does |
|---|---|
| [`@code-artisan/agent`](./packages/agent) | Environment-agnostic Agent SDK — ReAct loop, providers, tools, middlewares, sandbox interface |
| [`@code-artisan/backend`](./packages/backend) | Hono + Bun server — turn orchestration, persistence, auth, sandbox lifecycle, PTY sessions |
| [`@code-artisan/frontend`](./packages/frontend) | Vite + React 19 SPA — workspace UI, Monaco, xterm, live preview |
| [`@code-artisan/cli`](./packages/cli) | Terminal UI for the agent SDK (Ink-based) |
| [`@code-artisan/shared`](./packages/shared) | Shared types: message blocks, model catalog, conversation shapes |

## 🛠️ Tech Stack

**Frontend** — Vite 6 · React 19 · TypeScript 5.9 · Tailwind v4 · shadcn/ui · TanStack Router · TanStack Query · Zustand · Monaco · xterm.js · `react-resizable-panels`

**Backend** — Bun · Hono 4 · Drizzle ORM · Postgres · `better-auth` (GitHub OAuth) · `@anthropic-ai/sdk` · `@modelcontextprotocol/sdk`

**Sandbox** — E2B Code Interpreter (PTY API)

**Infrastructure** — Supabase (Postgres + Object Storage) · Railway / Docker (deploy)

**Models** — Claude Opus 4.7 · Claude Sonnet 4.6 · any OpenAI-compatible gateway via `LLM_BASE_URL`

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Bun** ≥ 1.x
- An **[E2B](https://e2b.dev)** API key
- A **[Supabase](https://supabase.com)** project (Postgres + Storage bucket named `attachments`)
- An **LLM** API key — Anthropic, or any OpenAI-compatible gateway (e.g. `aihubmix`)
- A **GitHub OAuth app** for sign-in (callback `http://localhost:3001/api/auth/callback/github`)

### Setup

```bash
git clone https://github.com/lhz960904/code-artisan.git
cd code-artisan
pnpm install

# Configure environment
cp .env.example .env
# Fill in DATABASE_URL, SUPABASE_*, LLM_API_KEY, E2B_API_KEY, GitHub OAuth, ...

# Push schema to your database
pnpm --filter @code-artisan/backend run db:push

# (First time only) Build the E2B sandbox template
pnpm sandbox:build

# Start frontend (:3000) + backend (:3001) in parallel
pnpm dev
```

Open <http://localhost:3000>.

### Build for production

```bash
pnpm build
pnpm --filter @code-artisan/backend run start
```

A `Dockerfile` is included for containerized deploys (Railway-ready).

## 🗺️ Roadmap

See [TODO.md](./TODO.md). Highlights from `P1`:

- [ ] One-click deploy (Vercel)
- [ ] Built-in DB integration (Supabase)
- [ ] Element-picker prompt enrichment
- [ ] Versioning & shareable conversation links
- [ ] Custom rules (`Agents.md`)
- [ ] i18n framework

`P3` ideas: plan mode, sub-agents, memory system, refresh-resume streaming.

## 🤝 Issues & PRs

Issues and PRs are welcome — feel free to open one any time. Chinese-speaking folks who'd rather chat directly, add me on WeChat:

<p align="center">
  <img src="./packages/frontend/public/wechat-qr.jpg" alt="WeChat QR" width="220" />
</p>

## 📄 License

MIT © [lhz960904](https://github.com/lhz960904)
