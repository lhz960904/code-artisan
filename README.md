<div align="center">
  <img src="./packages/frontend/public/favicon.svg" alt="CodeArtisan" width="84" height="84" />

# CodeArtisan

A web coding agent project — similar in spirit to bolt.new and v0.dev — built as a hands-on way to learn modern AI agent development.

[English](./README.md) · [简体中文](./README.zh-CN.md)

  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
    <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node" />
  </p>
</div>

## 🎬 Demo

https://github.com/user-attachments/assets/449acf6a-e12d-4dd5-a826-5ae6d825d68a

## ✨ Features

- **Hand-rolled Agent SDK.** No Vercel AI SDK or LangChain — a first-principles ReAct loop with multi-provider support, middleware, tools, and a sandbox abstraction, all fully pluggable.

- **MCP support.** Built-in MCP marketplace — install with one click and the agent automatically picks up the new tools on the next turn.

- **Built-in Skills system.** Ships with skills like full-stack app scaffolding; the agent reads them on demand to accelerate common tasks.

- **Sandboxed isolation.** Every conversation runs in its own [E2B](https://e2b.dev) sandbox; file snapshots restore the workspace on cold start. When using the Agent SDK standalone, swap to `LocalSandbox` to run on your own machine.

- **Full-featured workspace.** Live preview, Monaco editor, PTY-backed xterm terminals (agent and user share one session manager), file tree + full-text search, all over a single conversation-scoped WebSocket.

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
| [`@code-artisan/cli`](./packages/cli) | Terminal UI for the agent SDK (Ink-based). Scaffolded — future home for a standalone CLI |
| [`@code-artisan/shared`](./packages/shared) | Shared types: message blocks, model catalog, conversation shapes |

## 🛠️ Tech Stack

**Frontend** — Vite 6 · React 19 · TypeScript 5.9 · Tailwind v4 · shadcn/ui · TanStack Router · TanStack Query · Zustand · Monaco · xterm.js · react-resizable-panels

**Backend** — Bun · Hono 4 · Drizzle ORM · Postgres · better-auth (GitHub OAuth) · anthropic-ai/sdk · modelcontextprotocol/sdk

**Sandbox** — E2B Code Interpreter (PTY API)

**Infrastructure** — Supabase (Postgres + Object Storage) · Railway / Docker (deploy)

**Models** — Any Anthropic or OpenAI-compatible gateway (switch via `LLM_BASE_URL`)

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Bun** ≥ 1.x
- An **[E2B](https://e2b.dev)** API key
- A **[Supabase](https://supabase.com)** project (Postgres + Storage bucket named `attachments`)
- An **LLM API key** — Anthropic, or any OpenAI-compatible gateway
- A **GitHub OAuth App**

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

See [TODO.md](./TODO.md).

- [ ] Plan mode
- [ ] Versioning
- [ ] One-click deploy
- [ ] Built-in database
- [ ] Shareable links
- [ ] Element picker — click in preview to fill the prompt
- [ ] i18n framework

## 🤝 Issues & PRs

Issues and PRs are welcome — feel free to open one any time. For Chinese-speaking folks who'd rather chat directly, add me on WeChat:

<p align="center">
  <img src="./packages/frontend/public/wechat-qr.jpg" alt="WeChat QR" width="220" />
</p>

## 📄 License

MIT © [lhz960904](https://github.com/lhz960904)
