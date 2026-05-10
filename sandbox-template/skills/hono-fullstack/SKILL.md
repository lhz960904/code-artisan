---
name: hono-fullstack
description: >-
  Use this skill ONLY when the app needs a real server layer — calling third-party APIs with hidden keys (LLM, Stripe, OpenAI, payment processors), proxying webhooks, server-side rate limiting, or complex orchestration that can't run safely from the browser. For frontend-only apps (with or without persistence), use `frontend-starter` instead — it's simpler. Stack: Vite + React + TypeScript + Tailwind v3 + shadcn/ui + TanStack Router + TanStack Query + Zustand (frontend); Hono + Bun (backend, unified dev server via @hono/vite-dev-server). Pair with the `supabase` skill for any persistent data — the server stays for server-only work, data goes through frontend-direct Supabase + RLS.
---

## When to use

- App calls a third-party API where the key MUST stay server-side (LLM providers, Stripe, payment gateways, email services with secret keys).
- App needs server-side webhook handlers (Stripe / GitHub / external service callbacks).
- App needs server-side rate limiting / IP-based throttling that can't run client-side.
- App needs complex orchestration (multi-step transactions across external services, server-side LLM streaming proxies).

## When NOT to use

- **App is frontend-only** — landing pages, dashboards, todos, content sites, or any data-driven app where the frontend can talk to Supabase directly. Use **`frontend-starter`** instead, paired with the `supabase` skill if the app needs persistence. RLS enforces access control. No server, fewer moving parts, simpler deploy.
- User explicitly asks for Next.js / Remix / SvelteKit — use that stack instead.

If you're tempted to add a database driver (`pg`, `drizzle-orm`, `prisma`) or a service-role Supabase client to this template's `server/index.ts`, **stop**. That's a sign you should be using `frontend-starter` plus the `supabase` skill instead — RLS handles access control. This template's server is for **server-only secrets and orchestration**, not data CRUD.

## Workflow

1. Copy the template into the current workspace:
   ```bash
   cp -r /opt/skills/hono-fullstack/template/. .
   ```
   The template ships with `.code-artisan/manifest.json` declaring `bun install` + `bun dev` on port **5173**. The platform picks up this manifest, runs install, starts the dev server, and exposes the preview URL automatically — **do not run `bun install`, `bun dev`, or `expose_port` yourself on the first turn.**

2. **If the app also needs persistent data, follow the `supabase` skill's data patterns**: call `supabase_create_project`, define schema + RLS via `supabase_sql`, and read/write from the **frontend** using `import.meta.env.VITE_SUPABASE_*` + `createClient` from `@supabase/supabase-js`. **Do NOT** read or write data from the Hono server using a service-role key — data goes through the browser → Supabase → RLS path. The Hono server stays for server-only work (LLM calls, hidden secrets, third-party API proxying).

3. Iterate on the user's actual request — but only put server-only logic in `server/index.ts`. Vite HMR reloads changes live in the user's preview.

The dev server runs on port **5173 only** — `strictPort` is on. If you ever need to restart it (e.g. after a config change that requires a full restart), `kill_shell` the dev session and start it again yourself with `bash` (`run_in_background: true`, command `bun dev`). Do not change the port.

## How the dev server works — read this before touching server/index.ts

The template uses **one unified dev server** on port 5173. There is no separate backend process. Here's the chain:

```
bun dev  →  vite  →  @hono/vite-dev-server plugin  →  server/index.ts
```

`vite.config.ts` registers the `@hono/vite-dev-server` plugin with `entry: "server/index.ts"`. When Vite starts, the plugin loads `server/index.ts` via SSR and wires it into Vite's request pipeline. Routing split:

- `/api/*` — handled by the Hono app in `server/index.ts`
- everything else — handled by Vite (serves the React app, HMR, static assets)

**This means:**

- Running `bun dev` (which runs `vite`) already starts both frontend and backend. Do **not** try to run `bun run server/index.ts` separately — Bun will take over and skip Vite, breaking HMR.
- Do **not** change the `dev` script in `package.json`. `"dev": "vite"` is correct.
- When you add a new API route, just add it to `server/index.ts` and Vite will hot-reload it automatically.

## When extending server/index.ts

**Preserve these unchanged:**

- `export default { port, fetch: app.fetch }` — the shape `@hono/vite-dev-server` expects for loading your Hono app
- The `if (typeof Bun !== "undefined") { ... serveStatic ... }` block — production static-asset fallback. Not used in dev, critical in prod.
- `import { Hono } from "hono"` and `const app = new Hono()`

**Add routes by appending** to the existing route list:

```ts
app.get("/api/hello", (c) => { /* existing */ });

// Your new routes — add under /api/*:
app.get("/api/todos", (c) => c.json({ todos }));
app.post("/api/todos", async (c) => { /* ... */ });
```

Do **not** wrap the whole file in `serve({ ... })`, do **not** dynamically `import("vite").createServer()`, do **not** write your own request dispatcher. The plugin handles all of that.

## Verifying the backend

Inside the sandbox, `localhost` reaches the dev server directly. To verify a new API route:

```bash
curl -s http://localhost:5173/api/your-route
```

- Returns `200` + the expected JSON → route is wired correctly.
- Returns `200` + HTML (Vite's `index.html` fallback) → the path is not matched by Hono. Check the route is registered under `/api/*` and the file has been saved (Vite HMR reloads on save).
- `curl: exit 7` / `exit 56` → the dev server crashed. Check `bash_output` of the server session.

Do **not** curl the public `*.e2b.app` URL from inside the sandbox — that's the user-facing preview URL (browser-bound), and it routes out of the sandbox and back in, adding latency and masking real errors. Always verify via `localhost:5173`.

## Stack conventions

- **Routing**: TanStack Router, code-based in `src/router.tsx`. To add a page, define a new route there and add it to the route tree.
- **Data fetching**: TanStack Query. Client is in `src/lib/query-client.ts`. Use `useQuery` / `useMutation` in components.
- **Local state**: Zustand stores in `src/store/*.ts`. See `use-counter.ts` for the pattern.
- **UI**: shadcn/ui components live in `src/components/ui/`. To add more: `bunx shadcn@latest add <name>`.
- **Styling**: Tailwind v3 with CSS variables for theming (see `src/index.css`). Use `cn()` from `src/lib/utils.ts` for conditional classes.
- **Backend**: Hono app in `server/index.ts`. Mount routes under `/api/*` — anything else falls through to the Vite frontend.
- **Path alias**: `@/` maps to `src/`.

## Common tasks

- **Add an API endpoint**: add a `.get()` / `.post()` call under `/api/*` in `server/index.ts` (see "When extending server/index.ts" above).
- **Call an API from UI**: `useQuery({ queryKey: [...], queryFn: () => fetch("/api/...").then(r => r.json()) })`.
- **Add a shadcn component**: `bunx shadcn@latest add dialog` (etc.).
- **Add a new page**: extend the route tree in `src/router.tsx` with a new `createRoute` entry.

## Don'ts

- **Don't add a database driver, ORM, or service-role Supabase client to `server/index.ts`.** Persistent data goes through frontend-direct Supabase + RLS — see the `frontend-starter` and `supabase` skills. The Hono server is only for server-only secrets and orchestration.
- **Don't use this skill for apps that just need login + persistent data.** Use `frontend-starter` instead — no server needed, simpler deploy. Reach for `hono-fullstack` only when there's genuine server-only work.
- Don't add Next.js / Remix / SvelteKit or other meta-frameworks — this template intentionally stays as Vite + Hono.
- Don't change the dev server port (5173). It's fixed for preview integration.
- Don't change the `dev` script in `package.json` — `"dev": "vite"` is load-bearing (see "How the dev server works").
- Don't rewrite the unified dev server in `server/index.ts` — don't call `serve(...)`, don't dynamically import `vite`, don't build your own request dispatcher.
- Don't edit files under `/opt/skills/hono-fullstack/template/` — that's the read-only source. Always edit the copied files in the workspace.

## See also

- The `frontend-starter` skill — for frontend-only apps (default for most requests). Pair with `supabase` when persistence is needed.
- The `supabase` skill — full Supabase data-layer reference (RLS recipes, auth flows, storage, realtime). Pair with this skill when persistence is needed.
