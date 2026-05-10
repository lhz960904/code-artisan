---
name: frontend-starter
description: >-
  Default starter for any frontend-only app — landing pages, dashboards, todo lists, content sites, calculators, anything that runs entirely in the browser. Reach for this first; use it for the vast majority of user requests. Stack: Vite + React + TypeScript + Tailwind v3 + shadcn/ui + TanStack Router + TanStack Query + Zustand. The platform's iframe runtime plugin is pre-wired in vite.config.ts and the dev server boots automatically from .code-artisan/manifest.json. Trigger on: 落地页, 网页, 应用, 网站, 仪表盘, todo, 笔记, dashboard, landing page, web app, frontend, UI, page, todos, blog, content site, build me a, create a, make a.
---

## When to use

This is the **default skill for any new frontend app**. Reach for it first.

- Landing pages, marketing sites, calculators, hero pages
- Dashboards, internal tools, admin panels
- Todo apps, note apps, content feeds, social UIs
- Anything that lives entirely in the browser — with or without persistent data

## When NOT to use

- App needs a real server layer — third-party API with hidden keys (LLM, Stripe, payment gateways), webhook handlers, server-side rate limiting, complex orchestration. Use `hono-fullstack` instead.
- User explicitly asks for Next.js / Remix / SvelteKit. Use that stack instead.

## Workflow

1. Copy the template:
   ```bash
   cp -r /opt/skills/frontend-starter/template/. .
   ```
   The template ships with `.code-artisan/manifest.json` declaring `bun install` + `bun dev` on port **5173**. The platform picks up the manifest, runs install, starts the dev server, and exposes the preview automatically — **do not run `bun install`, `bun dev`, or `expose_port` yourself on the first turn.**

2. Iterate on the user's request. Replace `src/routes/index.tsx` with their actual page. Add new routes to `src/router.tsx`.

The dev server runs on port **5173 only** — `strictPort` is on. If you need to restart it (e.g. after a config change), `kill_shell` the dev session and start it again yourself with `bash` (`run_in_background: true`, command `bun dev`). Do not change the port.

## Persistence

If the user wants saved data (todos, posts, notes, profiles, settings) **and** the platform has Supabase tools available (`supabase_create_project`, `supabase_sql`), follow the `supabase` skill — it covers provisioning, RLS-keyed schemas, and the frontend-direct client wiring via `import.meta.env.VITE_SUPABASE_*`.

If Supabase tools are **not** available, use in-memory React state (`useState` / Zustand) and tell the user up-front: "Data only lives in this preview tab — it'll reset on reload. Connect Supabase from Settings → Integrations to make it persistent." Don't fake persistence with `localStorage` — it's worse than honest in-memory state because it hides the limitation.

## Stack conventions

- **Routing**: TanStack Router, code-based in `src/router.tsx`. Add new pages there.
- **Data fetching**: TanStack Query. Client is in `src/lib/query-client.ts`. Use `useQuery` / `useMutation` in components.
- **Local state**: Zustand stores in `src/store/*.ts`. Create the file as you need it.
- **UI**: shadcn/ui components live in `src/components/ui/`. Template ships `badge` / `button` / `card`. Add more with `bunx shadcn@latest add <name>` (e.g. `dialog`, `input`, `label`).
- **Styling**: Tailwind v3 with CSS variables for theming (see `src/index.css`). Use `cn()` from `src/lib/utils.ts` for conditional classes.
- **Path alias**: `@/` maps to `src/`.

## Don'ts

- **Don't add a Hono backend, `/api/*` routes, or any server-side file.** This template is frontend-only by design. If the user genuinely needs a server (hidden API keys, webhooks), switch to the `hono-fullstack` skill.
- **Don't add Next.js / Remix / SvelteKit** — this template stays as plain Vite + React.
- **Don't change the dev server port (5173).** It's fixed for preview integration.
- **Don't fake persistence with `localStorage`.** When the user wants data saved, either use Supabase (if connected) or be explicit about the in-memory limitation.
- **Don't edit files under `/opt/skills/frontend-starter/template/`** — that's the read-only source. Always edit copied files in the workspace.

## See also

- The `supabase` skill — full Supabase data-layer reference (auth, RLS recipes, storage, realtime). Use when adding persistence.
- The `hono-fullstack` skill — when the app genuinely needs a server (third-party API keys, webhooks, server-side orchestration).
