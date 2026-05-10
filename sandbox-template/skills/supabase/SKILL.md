---
name: supabase
description: >-
  Use this skill when the app needs persistent data, user accounts, file storage, or realtime updates. The platform integrates with the user's own Supabase organization via OAuth — this skill provisions a project under that org, runs schema + Row Level Security via the Management API, and wires the generated app to it through platform-injected env. Trigger on: "save data", "login / sign in / sign up", "user accounts", "database", "todos with auth", "file uploads", "realtime / live updates", or any spec where state must survive reload.
---

## When to use

- App needs to save data across reloads / sessions / users (todos, posts, comments, profiles, settings).
- App has user-facing auth (sign up, login, profile, password reset).
- App stores files / images / uploads.
- App pushes live updates between users (chat, presence, realtime feeds).

Do **not** use this skill if the app is purely static (landing page, marketing site, calculator), purely client-state (localStorage notes), or the user explicitly asked for a different backend (Firebase, Convex, custom Hono `/api` with another DB).

## How Supabase BYO works on this platform

The user has connected their own Supabase organization via OAuth in the platform settings. You don't have a Supabase URL or API key yet — you provision them by calling `supabase_create_project`, which:

1. Creates a fresh Postgres + Auth + Storage + Realtime project under their org.
2. Polls until the project is ACTIVE_HEALTHY (~30–60s).
3. Persists the URL + anon key onto this conversation in the platform DB.
4. Writes them into the sandbox so `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` resolve in your code.

The anon key is **public by design** — it gets bundled into the client. **Row Level Security is the only thing protecting user data.** Every user-owned table MUST have RLS enabled with policies keyed on `auth.uid()`.

## Workflow

### Step 1 — Ensure the project exists. ALWAYS call this first, every time you touch data.

`supabase_create_project` is idempotent. If a project already exists for this conversation, it returns the existing one instantly (`already_existed: true`). So calling it on every turn that touches data is safe and the cheapest way to guarantee env is wired up — you don't need to track or remember whether you've already provisioned.

```text
supabase_create_project({ name: "todo-app" })
  → { ref, url, anon_key, region, already_existed }
```

**If `already_existed: false`** (you just created the project), the dev server was already running with no Supabase env. Restart it once so Vite picks the new env up:

```text
kill_shell <dev session id>
bash(run_in_background: true, command: "<package-manager> dev")
```

(Use `bun dev`, `pnpm dev`, or `npm run dev` matching the project's package manager — check `package.json`.)

**If `already_existed: true`**, the dev server is already running with the right env. No restart needed.

### Step 2 — Define schema + RLS via `supabase_sql`.

DDL, policies, indexes, and seeds all go through this tool. It runs as the user's OAuth Bearer (no service-role key is exposed to you, by design).

```text
supabase_sql({ query: `
  CREATE TABLE todos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    completed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "owner can read"   ON todos FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "owner can insert" ON todos FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "owner can update" ON todos FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "owner can delete" ON todos FOR DELETE USING (auth.uid() = user_id);
` })
```

You can run multiple statements in one call — separate by `;`. Calling `supabase_sql` before `supabase_create_project` will return a "no project attached" error; always Step 1 first.

### Step 3 — Wire the client.

Install once (match the project's package manager):

```bash
bun add @supabase/supabase-js
# or: pnpm add @supabase/supabase-js
# or: npm install @supabase/supabase-js
```

Create a single shared client:

```ts
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

That's it — **no env-loading boilerplate, no async bootstrap.** The platform guarantees those vars are set when the dev server starts. Read them like any other Vite env var.

## RLS recipe — every user-owned table

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner can read"   ON <table> FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner can insert" ON <table> FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner can update" ON <table> FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "owner can delete" ON <table> FOR DELETE USING (auth.uid() = user_id);
```

Without `ENABLE ROW LEVEL SECURITY`, the table is **wide open to anyone with the public URL** — they get the anon key from the bundle and can read/write everything. RLS is non-negotiable.

For tables that should be public-readable (e.g. a public posts feed), still enable RLS but write a permissive read policy:

```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read" ON posts FOR SELECT USING (true);
CREATE POLICY "owner can write" ON posts FOR ALL USING (auth.uid() = author_id);
```

## Auth — `supabase.auth`

```ts
// Sign up (sends confirmation email by default)
const { data, error } = await supabase.auth.signUp({ email, password });

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({ email, password });

// Current user (call after session loads)
const { data: { user } } = await supabase.auth.getUser();

// Subscribe to session changes — wire this in your app root
supabase.auth.onAuthStateChange((event, session) => {
  // update auth store / redirect / etc.
});

// Sign out
await supabase.auth.signOut();
```

**Demo tip — disable email confirmation.** By default, sign-up requires the user to click a confirmation link sent to their email, which breaks self-contained demos. The user can disable this in Supabase Dashboard → Authentication → Sign In / Up → toggle off "Confirm email". Mention this if the app needs instant sign-up for demoing.

For OAuth providers (Google / GitHub), use `supabase.auth.signInWithOAuth({ provider: "google" })` — but that requires the user to configure the provider in their Supabase dashboard, so prefer email/password unless they ask for OAuth.

## File storage

```ts
// Upload — bucket must exist
await supabase.storage.from("avatars").upload(`${userId}/avatar.png`, file);

// Public URL (works only if bucket is public)
const { data } = supabase.storage.from("avatars").getPublicUrl(`${userId}/avatar.png`);
```

Create a bucket via `supabase_sql`:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
```

For private buckets, use `supabase.storage.from("...").createSignedUrl(...)` to generate time-limited URLs. Apply RLS on `storage.objects` to scope by `auth.uid()`.

## Realtime

```ts
const channel = supabase
  .channel("todos-changes")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "todos" },
    (payload) => {
      // payload.new / payload.old / payload.eventType — update local state
    },
  )
  .subscribe();

// On unmount
supabase.removeChannel(channel);
```

Realtime requires enabling the publication on the table — do it once via `supabase_sql`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE todos;
```

Realtime still respects RLS — users only get events for rows they're allowed to read.

## Don'ts

- **Don't try to use the service-role key.** It is intentionally not exposed to the sandbox. Anything privileged (DDL, RLS setup, seed data) goes through `supabase_sql` instead — that already runs with full project authority via OAuth Bearer.
- **Don't write `.env.local` yourself.** The platform owns it; manual edits are overwritten on every sandbox start. Read env via `import.meta.env.VITE_SUPABASE_*` and that's it.
- **Don't skip RLS.** A table without `ENABLE ROW LEVEL SECURITY` + policies is wide open to the internet. Ship RLS in the same `supabase_sql` call as the `CREATE TABLE`.
- **Don't hardcode the URL or anon key in code.** Always read from `import.meta.env.VITE_SUPABASE_URL` / `import.meta.env.VITE_SUPABASE_ANON_KEY`.
- **Don't call `supabase_sql` before `supabase_create_project`.** It will error with "no project attached" — wasted turn.
- **Don't add a server-side Supabase client** (`SUPABASE_SECRET_KEY`, service-role) in the generated app's Hono backend. The skill's design is frontend-direct + RLS — that's the entire reason the user picked Supabase. If you genuinely need server-side privileged ops, ask the user; do not assume.
- **Don't bother with file-based migrations.** This skill is for one-shot demo apps; just call `supabase_sql` again when the schema changes.
