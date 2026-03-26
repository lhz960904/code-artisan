# Phase 1: Scaffolding & Basic Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up monorepo, connect all external services, deliver a working round-trip: browser input → backend → Claude API → E2B sandbox execution → result displayed in browser.

**Architecture:** Monorepo with pnpm workspace (packages/frontend, packages/backend, packages/shared). Backend is Hono.js on Node.js. Frontend is Vite + React. Supabase for DB. E2B for sandbox. Claude API for AI. No auth in Phase 1 — that's Phase 3.

**Tech Stack:** pnpm, TypeScript, Vite, React, Tailwind CSS, shadcn/ui, Hono.js, Drizzle ORM, Supabase JS Client, E2B SDK, Anthropic SDK

---

## File Structure

```text
web-ai-coding-agent/
├── package.json                    # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json              # Shared TS config
├── .env.example                    # Template for env vars
├── .gitignore
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── types.ts            # Shared types: Event, Conversation, Tool definitions
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # Hono app entry, CORS, routes mount
│   │   │   ├── env.ts              # Environment variable validation
│   │   │   ├── routes/
│   │   │   │   └── conversations.ts # POST /messages endpoint (Phase 1 only)
│   │   │   ├── services/
│   │   │   │   ├── sandbox.ts      # E2B sandbox create/execute/read/write/list
│   │   │   │   ├── claude.ts       # Claude API streaming call with tools
│   │   │   │   └── agent.ts        # Agent loop: Claude ↔ sandbox tool execution
│   │   │   └── db/
│   │   │       ├── index.ts        # Drizzle client init
│   │   │       └── schema.ts       # Drizzle schema definitions
│   │   └── test/
│   │       ├── services/
│   │       │   ├── sandbox.test.ts
│   │       │   ├── claude.test.ts
│   │       │   └── agent.test.ts
│   │       └── setup.ts            # Test helpers
│   └── frontend/
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── index.html
│       ├── components.json          # shadcn/ui config
│       └── src/
│           ├── main.tsx             # React entry
│           ├── app.tsx              # Router setup
│           ├── lib/
│           │   ├── supabase.ts      # Supabase client init
│           │   └── api.ts           # Backend API client
│           ├── routes/
│           │   ├── __root.tsx       # Root layout
│           │   └── index.tsx        # Home page with basic chat
│           └── components/
│               └── chat-panel.tsx   # Basic chat input + message display
```

---

## Task 1: Monorepo Scaffolding

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`

- [ ] **Step 1: Initialize git repo and workspace root**

```bash
cd /Users/lihaoze/.agentara/workspace/projects/web-ai-coding-agent
git init
```

Create `package.json`:

```json
{
  "name": "web-ai-coding-agent",
  "private": true,
  "scripts": {
    "dev:frontend": "pnpm --filter frontend dev",
    "dev:backend": "pnpm --filter backend dev",
    "dev": "pnpm run --parallel dev:frontend dev:backend",
    "build": "pnpm --filter shared build && pnpm --filter frontend build && pnpm --filter backend build",
    "test": "pnpm --filter backend test"
  },
  "engines": {
    "node": ">=20"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

Create `.gitignore`:

```text
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

Create `.env.example`:

```text
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxx

# E2B
E2B_API_KEY=e2b_xxx
```

- [ ] **Step 2: Create shared package**

```bash
mkdir -p packages/shared/src
```

Create `packages/shared/package.json`:

```json
{
  "name": "@web-ai-coding-agent/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/types.ts",
  "types": "src/types.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/shared/src/types.ts`:

```ts
// Event types flowing through the system
export type EventType =
  | "user_message"
  | "ai_text"
  | "tool_call"
  | "tool_result"
  | "confirm_required"
  | "confirm_response"
  | "preview_url"
  | "error";

export interface AgentEvent {
  id: string;
  conversationId: string;
  seq: number;
  type: EventType;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  mode: "yolo" | "confirm";
  sandboxId: string | null;
  deployUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// AI Tool definitions
export const TOOL_DEFINITIONS = [
  {
    name: "read_file",
    description: "Read the content of a file at the given path in the sandbox.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "Absolute file path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path in the sandbox. Creates directories as needed.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "Absolute file path to write" },
        content: { type: "string" as const, description: "File content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "execute_command",
    description: "Execute a shell command in the sandbox and return stdout/stderr.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string" as const, description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "list_files",
    description: "List files and directories at the given path in the sandbox.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "Directory path to list" },
      },
      required: ["path"],
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

// Tool call/result payloads
export interface ToolCallData {
  tool: ToolName;
  args: Record<string, string>;
}

export interface ToolResultData {
  tool: ToolName;
  output: string;
  error?: string;
}

// API request/response types
export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  conversationId: string;
  status: "started";
}
```

- [ ] **Step 3: Install pnpm and verify workspace**

```bash
pnpm install
pnpm ls --depth 0
```

Expected: Empty workspace with shared package listed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: initialize monorepo with pnpm workspace and shared types"
```

---

## Task 2: Backend Scaffolding

**Files:**

- Create: `packages/backend/package.json`, `packages/backend/tsconfig.json`, `packages/backend/src/index.ts`, `packages/backend/src/env.ts`

- [ ] **Step 1: Create backend package**

```bash
mkdir -p packages/backend/src/{routes,services,db}
mkdir -p packages/backend/test/services
```

Create `packages/backend/package.json`:

```json
{
  "name": "@web-ai-coding-agent/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@e2b/code-interpreter": "^1.0.4",
    "@supabase/supabase-js": "^2.49.1",
    "@web-ai-coding-agent/shared": "workspace:*",
    "drizzle-orm": "^0.38.0",
    "hono": "^4.7.0",
    "postgres": "^3.4.5",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

Create `packages/backend/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create env validation**

Create `packages/backend/src/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  E2B_API_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 3: Create Hono server entry**

Create `packages/backend/src/index.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

console.log(`Backend starting on port ${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
```

- [ ] **Step 4: Install dependencies and verify**

```bash
cd /Users/lihaoze/.agentara/workspace/projects/web-ai-coding-agent
pnpm install
```

Create `.env` from `.env.example` with real values, then:

```bash
pnpm dev:backend
```

Expected: Server starts on port 3001. `curl http://localhost:3001/api/health` returns `{"status":"ok"}`.

- [ ] **Step 5: Commit**

```bash
git add packages/backend
git commit -m "feat: add backend scaffolding with Hono server"
```

---

## Task 3: Frontend Scaffolding

**Files:**

- Create: All files under `packages/frontend/`

- [ ] **Step 1: Scaffold Vite + React + TS project**

```bash
cd /Users/lihaoze/.agentara/workspace/projects/web-ai-coding-agent
pnpm create vite packages/frontend -- --template react-ts
```

Update `packages/frontend/package.json` — set name and add dependencies:

```json
{
  "name": "@web-ai-coding-agent/frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1",
    "@tanstack/react-router": "^1.95.0",
    "@web-ai-coding-agent/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.0"
  },
  "devDependencies": {
    "@tanstack/router-devtools": "^1.95.0",
    "@tanstack/router-plugin": "^1.95.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Configure Tailwind CSS v4**

Tailwind CSS v4 uses CSS-first configuration. Update `packages/frontend/src/index.css`:

```css
@import "tailwindcss";
```

Update `packages/frontend/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

Update dependencies in `packages/frontend/package.json` — replace tailwindcss with v4:

```json
{
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

Remove `postcss.config.js`, `tailwind.config.ts`, and `autoprefixer` from devDependencies — Tailwind v4 doesn't need them.

- [ ] **Step 3: Set up shadcn/ui**

```bash
cd packages/frontend
pnpm dlx shadcn@latest init
```

Select: TypeScript, Default style, CSS variables, base color Zinc.

This will create `components.json` and `src/components/ui/` directory.

Add a few base components:

```bash
pnpm dlx shadcn@latest add button input scroll-area
```

- [ ] **Step 4: Set up TanStack Router**

Create `packages/frontend/src/app.tsx`:

```tsx
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return <RouterProvider router={router} />;
}
```

Update `packages/frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Create `packages/frontend/src/routes/__root.tsx`:

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="h-screen bg-[#0d1117] text-[#e6edf3]">
      <Outlet />
    </div>
  ),
});
```

Create `packages/frontend/src/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "../components/chat-panel";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-2xl p-4">
        <h1 className="mb-8 text-center text-2xl font-semibold text-[#58a6ff]">
          Web AI Coding Agent
        </h1>
        <ChatPanel />
      </div>
    </div>
  );
}
```

Update `packages/frontend/vite.config.ts` to add TanStack Router plugin:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 5: Create basic ChatPanel component**

Create `packages/frontend/src/lib/api.ts`:

```ts
const API_BASE = "/api";

export async function sendMessage(content: string): Promise<{
  conversationId: string;
  events: Array<{ type: string; data: Record<string, unknown> }>;
}> {
  const res = await fetch(`${API_BASE}/conversations/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

Create `packages/frontend/src/components/chat-panel.tsx`:

```tsx
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { sendMessage } from "../lib/api";

interface Message {
  role: "user" | "agent";
  content: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const content = input.trim();
    if (!content || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setLoading(true);

    try {
      const result = await sendMessage(content);
      // Extract AI text events from the response
      for (const event of result.events) {
        if (event.type === "ai_text") {
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: event.data.content as string },
          ]);
        } else if (event.type === "tool_result") {
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              content: `\`${event.data.tool}\`: ${event.data.output}`,
            },
          ]);
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: `Error: ${err}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[600px] flex-col rounded-lg border border-[#30363d] bg-[#161b22]">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className="space-y-1">
              <div
                className={`text-xs font-semibold uppercase tracking-wide ${
                  msg.role === "agent" ? "text-[#58a6ff]" : "text-[#8b949e]"
                }`}
              >
                {msg.role === "agent" ? "Agent" : "You"}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#e6edf3]">
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-sm text-[#8b949e] animate-pulse">
              Thinking...
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-[#30363d] p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your task..."
            className="flex-1 border-[#30363d] bg-[#0d1117] text-[#e6edf3] placeholder:text-[#484f58]"
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-[#238636] hover:bg-[#2ea043] text-white"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Install and verify frontend runs**

```bash
cd /Users/lihaoze/.agentara/workspace/projects/web-ai-coding-agent
pnpm install
pnpm dev:frontend
```

Expected: Vite dev server at `http://localhost:5173`. Dark page with centered "Web AI Coding Agent" heading and chat input.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend
git commit -m "feat: add frontend scaffolding with Vite, React, Tailwind, shadcn, TanStack Router"
```

---

## Task 4: Supabase Schema + Drizzle Setup

**Files:**

- Create: `packages/backend/src/db/schema.ts`, `packages/backend/src/db/index.ts`

- [ ] **Step 1: Create Drizzle schema**

Create `packages/backend/src/db/schema.ts`:

```ts
import { pgTable, uuid, text, bigint, serial, jsonb, timestamp } from "drizzle-orm/pg-core";

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title"),
  mode: text("mode").notNull().default("yolo"),
  sandboxId: text("sandbox_id"),
  deployUrl: text("deploy_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  seq: serial("seq").notNull(),
  type: text("type").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fileSnapshots = pgTable("file_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  path: text("path").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userQuotas = pgTable("user_quotas", {
  userId: uuid("user_id").primaryKey(),
  totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(1000000),
  usedTokens: bigint("used_tokens", { mode: "number" }).notNull().default(0),
});
```

- [ ] **Step 2: Create Drizzle client**

Create `packages/backend/src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

// Extract Postgres connection string from Supabase URL
// Supabase provides a direct Postgres connection string in the dashboard
const connectionString = env.DATABASE_URL;

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

Update `packages/backend/src/env.ts` to add DATABASE_URL:

```ts
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  E2B_API_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

Update `.env.example`:

```text
# Database (from Supabase dashboard → Settings → Database → Connection string)
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxx

# E2B
E2B_API_KEY=e2b_xxx
```

- [ ] **Step 3: Add drizzle-kit config for migrations**

Create `packages/backend/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Add migration scripts to `packages/backend/package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [ ] **Step 4: Push schema to Supabase**

```bash
cd packages/backend
pnpm db:push
```

Expected: Tables created in Supabase. Verify in Supabase dashboard → Table Editor.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db packages/backend/drizzle.config.ts .env.example
git commit -m "feat: add Drizzle schema and Supabase database setup"
```

---

## Task 5: E2B Sandbox Service

**Files:**

- Create: `packages/backend/src/services/sandbox.ts`
- Test: `packages/backend/test/services/sandbox.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/test/setup.ts`:

```ts
import { config } from "dotenv";
config({ path: "../../.env" });
```

Create `packages/backend/test/services/sandbox.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { SandboxService } from "../../src/services/sandbox.js";

describe("SandboxService", () => {
  let sandbox: SandboxService | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.close();
      sandbox = null;
    }
  });

  it("should create a sandbox and execute a command", async () => {
    sandbox = await SandboxService.create();
    const result = await sandbox.executeCommand("echo hello");
    expect(result.output.trim()).toBe("hello");
    expect(result.error).toBeUndefined();
  }, 30000);

  it("should write and read a file", async () => {
    sandbox = await SandboxService.create();
    await sandbox.writeFile("/tmp/test.txt", "hello world");
    const content = await sandbox.readFile("/tmp/test.txt");
    expect(content).toBe("hello world");
  }, 30000);

  it("should list files in a directory", async () => {
    sandbox = await SandboxService.create();
    await sandbox.writeFile("/tmp/project/main.py", "print('hi')");
    const files = await sandbox.listFiles("/tmp/project");
    expect(files).toContain("main.py");
  }, 30000);
});
```

Add vitest config to `packages/backend/package.json` (or create `vitest.config.ts`):

Create `packages/backend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lihaoze/.agentara/workspace/projects/web-ai-coding-agent
pnpm --filter backend test
```

Expected: FAIL — `Cannot find module '../../src/services/sandbox.js'`

- [ ] **Step 3: Implement SandboxService**

Create `packages/backend/src/services/sandbox.ts`:

```ts
import { Sandbox } from "@e2b/code-interpreter";

export class SandboxService {
  private constructor(private sandbox: Sandbox) {}

  static async create(): Promise<SandboxService> {
    const sandbox = await Sandbox.create();
    return new SandboxService(sandbox);
  }

  static async reconnect(sandboxId: string): Promise<SandboxService> {
    const sandbox = await Sandbox.connect(sandboxId);
    return new SandboxService(sandbox);
  }

  get id(): string {
    return this.sandbox.sandboxId;
  }

  async executeCommand(command: string): Promise<{ output: string; error?: string }> {
    const result = await this.sandbox.commands.run(command);
    return {
      output: result.stdout,
      error: result.stderr || undefined,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.sandbox.files.write(path, content);
  }

  async readFile(path: string): Promise<string> {
    const content = await this.sandbox.files.read(path);
    return content;
  }

  async listFiles(path: string): Promise<string[]> {
    const entries = await this.sandbox.files.list(path);
    return entries.map((e) => e.name);
  }

  async restoreFiles(snapshots: Array<{ path: string; content: string }>): Promise<void> {
    for (const { path, content } of snapshots) {
      await this.writeFile(path, content);
    }
  }

  async close(): Promise<void> {
    await this.sandbox.kill();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter backend test
```

Expected: All 3 tests PASS. (Requires valid E2B_API_KEY in `.env`)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/sandbox.ts packages/backend/test packages/backend/vitest.config.ts
git commit -m "feat: add E2B sandbox service with read/write/execute/list"
```

---

## Task 6: Claude API Service

**Files:**

- Create: `packages/backend/src/services/claude.ts`
- Test: `packages/backend/test/services/claude.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/test/services/claude.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ClaudeService } from "../../src/services/claude.js";
import { TOOL_DEFINITIONS } from "@web-ai-coding-agent/shared";

describe("ClaudeService", () => {
  it("should return a text response for a simple question", async () => {
    const claude = new ClaudeService();
    const response = await claude.chat([
      { role: "user", content: "Say hello in exactly one word." },
    ]);

    expect(response.type).toBe("text");
    if (response.type === "text") {
      expect(response.content.toLowerCase()).toContain("hello");
    }
  }, 30000);

  it("should return a tool_use response when appropriate", async () => {
    const claude = new ClaudeService();
    const response = await claude.chat([
      { role: "user", content: "List the files in /tmp directory." },
    ]);

    expect(response.type).toBe("tool_use");
    if (response.type === "tool_use") {
      expect(response.toolName).toBe("list_files");
      expect(response.toolInput).toHaveProperty("path");
    }
  }, 30000);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test -- test/services/claude.test.ts
```

Expected: FAIL — `Cannot find module '../../src/services/claude.js'`

- [ ] **Step 3: Implement ClaudeService**

Create `packages/backend/src/services/claude.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS } from "@web-ai-coding-agent/shared";
import { env } from "../env.js";

type MessageParam = Anthropic.MessageParam;

interface TextResponse {
  type: "text";
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

interface ToolUseResponse {
  type: "tool_use";
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, string>;
  textContent: string;
  usage: { inputTokens: number; outputTokens: number };
}

export type ClaudeResponse = TextResponse | ToolUseResponse;

const SYSTEM_PROMPT = `You are an AI coding agent running in a sandboxed Linux environment. You help users write code, execute commands, and build projects.

You have access to these tools:
- read_file: Read file contents
- write_file: Create or overwrite files
- execute_command: Run shell commands (bash)
- list_files: List directory contents

Always use tools to interact with the filesystem. When the user asks you to write code, use write_file to create the file, then execute_command to run it. Be concise in your text responses.`;

export class ClaudeService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async chat(messages: MessageParam[]): Promise<ClaudeResponse> {
    const response = await this.client.messages.create({
      model: "claude-opus-4-5-20250414",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages,
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    // Check if response contains tool use
    const toolBlock = response.content.find((block) => block.type === "tool_use");
    const textBlock = response.content.find((block) => block.type === "text");

    if (toolBlock && toolBlock.type === "tool_use") {
      return {
        type: "tool_use",
        toolCallId: toolBlock.id,
        toolName: toolBlock.name,
        toolInput: toolBlock.input as Record<string, string>,
        textContent: textBlock?.type === "text" ? textBlock.text : "",
        usage,
      };
    }

    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as Anthropic.TextBlock).text)
      .join("\n");

    return { type: "text", content: textContent, usage };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter backend test -- test/services/claude.test.ts
```

Expected: Both tests PASS. (Requires valid ANTHROPIC_API_KEY in `.env`)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/claude.ts packages/backend/test/services/claude.test.ts
git commit -m "feat: add Claude API service with tool calling support"
```

---

## Task 7: Agent Loop

**Files:**

- Create: `packages/backend/src/services/agent.ts`
- Test: `packages/backend/test/services/agent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/test/services/agent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AgentService } from "../../src/services/agent.js";
import type { AgentEvent } from "@web-ai-coding-agent/shared";

describe("AgentService", () => {
  it("should run a simple agent loop and return events", async () => {
    const collectedEvents: Array<{ type: string; data: Record<string, unknown> }> = [];

    const agent = new AgentService({
      onEvent: (type, data) => {
        collectedEvents.push({ type, data });
      },
    });

    await agent.run("Create a file /tmp/hello.txt with content 'hello world', then read it back.");

    // Should have tool_call events for write_file and read_file
    const toolCalls = collectedEvents.filter((e) => e.type === "tool_call");
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);

    // Should have tool_result events
    const toolResults = collectedEvents.filter((e) => e.type === "tool_result");
    expect(toolResults.length).toBeGreaterThanOrEqual(1);

    // Should end with an ai_text event
    const lastEvent = collectedEvents[collectedEvents.length - 1];
    expect(lastEvent.type).toBe("ai_text");
  }, 120000);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend test -- test/services/agent.test.ts
```

Expected: FAIL — `Cannot find module '../../src/services/agent.js'`

- [ ] **Step 3: Implement AgentService**

Create `packages/backend/src/services/agent.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeService, type ClaudeResponse } from "./claude.js";
import { SandboxService } from "./sandbox.js";
import type { ToolName, ToolCallData, ToolResultData } from "@web-ai-coding-agent/shared";

interface AgentOptions {
  onEvent: (type: string, data: Record<string, unknown>) => void;
  maxIterations?: number;
}

export class AgentService {
  private claude: ClaudeService;
  private options: Required<AgentOptions>;

  constructor(options: AgentOptions) {
    this.claude = new ClaudeService();
    this.options = {
      maxIterations: 10,
      ...options,
    };
  }

  async run(userMessage: string): Promise<{ totalTokens: number }> {
    const sandbox = await SandboxService.create();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: userMessage },
      ];

      for (let i = 0; i < this.options.maxIterations; i++) {
        const response = await this.claude.chat(messages);
        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;

        if (response.type === "text") {
          this.options.onEvent("ai_text", { content: response.content });
          break;
        }

        // Handle tool call
        if (response.textContent) {
          this.options.onEvent("ai_text", { content: response.textContent });
        }

        this.options.onEvent("tool_call", {
          tool: response.toolName,
          args: response.toolInput,
        } satisfies ToolCallData);

        // Execute the tool
        const toolResult = await this.executeTool(
          sandbox,
          response.toolName as ToolName,
          response.toolInput
        );

        this.options.onEvent("tool_result", toolResult);

        // Add assistant message + tool result to conversation
        messages.push({
          role: "assistant",
          content: [
            ...(response.textContent
              ? [{ type: "text" as const, text: response.textContent }]
              : []),
            {
              type: "tool_use" as const,
              id: response.toolCallId,
              name: response.toolName,
              input: response.toolInput,
            },
          ],
        });

        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: response.toolCallId,
              content: toolResult.error
                ? `Error: ${toolResult.error}\nOutput: ${toolResult.output}`
                : toolResult.output,
            },
          ],
        });
      }
    } finally {
      await sandbox.close();
    }

    return { totalTokens: totalInputTokens + totalOutputTokens };
  }

  private async executeTool(
    sandbox: SandboxService,
    tool: ToolName,
    args: Record<string, string>
  ): Promise<ToolResultData> {
    try {
      switch (tool) {
        case "read_file": {
          const content = await sandbox.readFile(args.path);
          return { tool, output: content };
        }
        case "write_file": {
          await sandbox.writeFile(args.path, args.content);
          return { tool, output: `File written to ${args.path}` };
        }
        case "execute_command": {
          const result = await sandbox.executeCommand(args.command);
          return { tool, output: result.output, error: result.error };
        }
        case "list_files": {
          const files = await sandbox.listFiles(args.path);
          return { tool, output: files.join("\n") };
        }
        default:
          return { tool, output: "", error: `Unknown tool: ${tool}` };
      }
    } catch (err) {
      return { tool, output: "", error: String(err) };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter backend test -- test/services/agent.test.ts
```

Expected: PASS. The agent should create a sandbox, write a file, read it back, and produce a final text response. (Requires both ANTHROPIC_API_KEY and E2B_API_KEY in `.env`)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/agent.ts packages/backend/test/services/agent.test.ts
git commit -m "feat: add agent loop with Claude + E2B tool execution"
```

---

## Task 8: API Endpoint — Send Message

**Files:**

- Create: `packages/backend/src/routes/conversations.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Create the conversations route**

Create `packages/backend/src/routes/conversations.ts`:

```ts
import { Hono } from "hono";
import { AgentService } from "../services/agent.js";

const conversations = new Hono();

// Phase 1: Simplified endpoint — no auth, no DB persistence, just run agent and return events
conversations.post("/messages", async (c) => {
  const { content } = await c.req.json<{ content: string }>();

  if (!content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  const collectedEvents: Array<{ type: string; data: Record<string, unknown> }> = [];

  const agent = new AgentService({
    onEvent: (type, data) => {
      collectedEvents.push({ type, data });
    },
  });

  const { totalTokens } = await agent.run(content);

  return c.json({
    conversationId: "temp-phase1",
    events: collectedEvents,
    usage: { totalTokens },
  });
});

export { conversations };
```

- [ ] **Step 2: Mount route in Hono app**

Update `packages/backend/src/index.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { conversations } from "./routes/conversations.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/conversations", conversations);

console.log(`Backend starting on port ${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
```

- [ ] **Step 3: Test manually with curl**

Start the backend:

```bash
pnpm dev:backend
```

In another terminal:

```bash
curl -X POST http://localhost:3001/api/conversations/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Write a Python file that prints hello world, save it as /tmp/hello.py, and run it."}'
```

Expected: JSON response with `events` array containing `tool_call`, `tool_result`, and `ai_text` entries. The tool_result for execute_command should show "hello world" in output.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/conversations.ts packages/backend/src/index.ts
git commit -m "feat: add POST /messages endpoint connecting frontend to agent loop"
```

---

## Task 9: End-to-End Integration

**Files:**

- No new files — verify the full stack works together

- [ ] **Step 1: Start both frontend and backend**

```bash
cd /Users/lihaoze/.agentara/workspace/projects/web-ai-coding-agent
pnpm dev
```

Expected: Backend on `http://localhost:3001`, Frontend on `http://localhost:5173`.

- [ ] **Step 2: Test in browser**

Open `http://localhost:5173` in browser.

1. Type: "Write a Python script that prints the first 10 Fibonacci numbers, save it as /tmp/fib.py, and run it."
2. Click Send
3. Wait for response

Expected: Chat shows agent's text response plus tool results (file written, command output with Fibonacci numbers).

- [ ] **Step 3: Verify error handling**

Type: "Read the file /nonexistent/file.txt"

Expected: Agent attempts read_file, gets an error, and reports it back gracefully.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: phase 1 complete — basic end-to-end agent loop working"
```

---

## Verification Checklist

Phase 1 is complete when:

- [ ] `pnpm dev` starts both frontend and backend
- [ ] `pnpm --filter backend test` — all tests pass
- [ ] Browser at `localhost:5173` shows chat interface
- [ ] User types a coding task → AI writes code in E2B → executes → result shown in chat
- [ ] Multiple tool calls work in a single agent loop (write + execute)
- [ ] Errors from E2B are handled gracefully
