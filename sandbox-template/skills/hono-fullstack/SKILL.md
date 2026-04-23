---
name: hono-fullstack
description: >-
  Use this skill when the user wants to build a full-stack web app from scratch and has not specified a different stack. Scaffolds a runnable demo project and documents the conventions. Stack: Vite + React + TypeScript + Tailwind v3 + shadcn/ui + TanStack Router + TanStack Query + Zustand (frontend); Hono + Bun (backend, unified dev server via @hono/vite-dev-server).
---

## When to use

- User asks to build a full-stack web app / SaaS / landing + API / demo project.
- User hasn't specified a stack — this is the default recommended stack.

Do **not** use this skill if the user explicitly asks for Next.js, Remix, SvelteKit, or a non-full-stack project (pure static site, pure CLI, etc.).

## Workflow

1. Copy the template into the current workspace:
   ```bash
   cp -r /opt/skills/hono-fullstack/template/. .
   ```
2. Install dependencies:
   ```bash
   bun install
   ```
3. Start the dev server in the background (unified frontend + backend on port **5173**):
   ```bash
   bun dev
   ```
   The dev server runs on port **5173 only** — `strictPort` is on, so if 5173 is taken it will fail immediately. If that happens, use `bash_output` to inspect the error and kill whatever is holding the port, then retry. Do not change the port.
4. Expose port 5173 so the user can preview the app.
5. Then iterate on the user's actual request (add routes, components, API endpoints, etc.).

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

- Don't add Next.js / Remix / SvelteKit or other meta-frameworks — this template intentionally stays as Vite + Hono.
- Don't add a database unless the user explicitly asks. The demo is intentionally stateless.
- Don't change the dev server port (5173). It's fixed for preview integration.
- Don't change the `dev` script in `package.json` — `"dev": "vite"` is load-bearing (see "How the dev server works").
- Don't rewrite the unified dev server in `server/index.ts` — don't call `serve(...)`, don't dynamically import `vite`, don't build your own request dispatcher.
- Don't edit files under `/opt/skills/hono-fullstack/template/` — that's the read-only source. Always edit the copied files in the workspace.
