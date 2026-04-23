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

## Stack conventions

- **Routing**: TanStack Router, code-based in `src/router.tsx`. To add a page, define a new route there and add it to the route tree.
- **Data fetching**: TanStack Query. Client is in `src/lib/query-client.ts`. Use `useQuery` / `useMutation` in components.
- **Local state**: Zustand stores in `src/store/*.ts`. See `use-counter.ts` for the pattern.
- **UI**: shadcn/ui components live in `src/components/ui/`. To add more: `bunx shadcn@latest add <name>`.
- **Styling**: Tailwind v3 with CSS variables for theming (see `src/index.css`). Use `cn()` from `src/lib/utils.ts` for conditional classes.
- **Backend**: Hono app in `server/index.ts`. Mount routes under `/api/*` — anything else falls through to the Vite frontend.
- **Path alias**: `@/` maps to `src/`.

## Common tasks

- **Add an API endpoint**: add a `.get()` / `.post()` call under `/api/*` in `server/index.ts`.
- **Call an API from UI**: `useQuery({ queryKey: [...], queryFn: () => fetch("/api/...").then(r => r.json()) })`.
- **Add a shadcn component**: `bunx shadcn@latest add dialog` (etc.).
- **Add a new page**: extend the route tree in `src/router.tsx` with a new `createRoute` entry.

## Don'ts

- Don't add Next.js / Remix / SvelteKit or other meta-frameworks — this template intentionally stays as Vite + Hono.
- Don't add a database unless the user explicitly asks. The demo is intentionally stateless.
- Don't change the dev server port (5173). It's fixed for preview integration.
- Don't edit `template/` files in the skill directory — copy them into the workspace first, then edit the workspace copy.
