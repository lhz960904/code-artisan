# Agent Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/agent-runner`, a Hono HTTP server that runs inside E2B sandboxes, receives invoke requests from the backend, runs `@code-artisan/agent`, and streams results back via SSE.

**Architecture:** agent-runner is a standalone package with 3 endpoints (invoke, stop, health). It creates an Agent per request, consumes the async generator, serializes each yielded message as an SSE event. After the agent finishes, it scans the workspace for modified files (via mtime) and emits file events. One agent runs at a time per sandbox.

**Tech Stack:** Bun, Hono, `@code-artisan/agent` (workspace dependency)

---

### Task 1: Package Scaffolding

**Files:**

- Create: `packages/agent-runner/package.json`
- Create: `packages/agent-runner/tsconfig.json`
- Create: `packages/agent-runner/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@code-artisan/agent-runner",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "module": "index.ts",
  "scripts": {
    "start": "bun run index.ts",
    "check": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "@code-artisan/agent": "workspace:*"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun"]
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 3: Create minimal index.ts**

```typescript
import { Hono } from "hono";
import { agentRoutes } from "./routes/agent";

const app = new Hono();

app.route("/", agentRoutes);

const PORT = Number(process.env.PORT ?? 3000);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`agent-runner listening on port ${PORT}`);
```

- [ ] **Step 4: Install dependencies**

Run: `cd /Users/lihaoze/.agentara/workspace/projects/code-artisan && pnpm install`
Expected: No errors, lockfile updated.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-runner/package.json packages/agent-runner/tsconfig.json packages/agent-runner/index.ts pnpm-lock.yaml
git commit -m "feat(agent-runner): scaffold package with Hono server"
```

---

### Task 2: SSE Event Types

**Files:**

- Create: `packages/agent-runner/types.ts`

- [ ] **Step 1: Define SSE event types and request/response types**

```typescript
import type { AssistantMessage, ToolMessage, UserMessage, NonSystemMessage, TokenUsage } from "@code-artisan/agent";

export interface InvokeRequest {
  message: UserMessage;
  history: NonSystemMessage[];
  files: FileSnapshot[];
  config: InvokeConfig;
}

export interface InvokeConfig {
  model: string;
  apiKey: string;
  baseURL?: string;
  prompt?: string;
  maxSteps?: number;
}

export interface FileSnapshot {
  path: string;
  content: string;
}

export type RunnerEvent =
  | { type: "assistant"; message: AssistantMessage }
  | { type: "tool"; message: ToolMessage }
  | { type: "file"; files: FileSnapshot[] }
  | { type: "done"; usage: TokenUsage }
  | { type: "error"; error: string };
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent-runner/types.ts
git commit -m "feat(agent-runner): add SSE event and request types"
```

---

### Task 3: Modified Files Scanner

**Files:**

- Create: `packages/agent-runner/services/file-scanner.ts`
- Create: `packages/agent-runner/services/__test__/file-scanner.test.ts`

- [ ] **Step 1: Write failing tests for getModifiedFiles**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModifiedFiles } from "../file-scanner";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "scanner-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("getModifiedFiles", () => {
  it("should return files modified after the given timestamp", async () => {
    // Create a file before the timestamp
    await writeFile(join(tempDir, "old.txt"), "old content");

    // Wait a bit then record timestamp
    await new Promise((r) => setTimeout(r, 50));
    const since = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    // Create a file after the timestamp
    await writeFile(join(tempDir, "new.txt"), "new content");

    const files = await getModifiedFiles(tempDir, since);

    expect(files.length).toBe(1);
    expect(files[0].path).toContain("new.txt");
    expect(files[0].content).toBe("new content");
  });

  it("should return empty array when no files modified", async () => {
    await writeFile(join(tempDir, "old.txt"), "old");

    await new Promise((r) => setTimeout(r, 50));
    const since = Date.now();

    const files = await getModifiedFiles(tempDir, since);
    expect(files).toEqual([]);
  });

  it("should scan subdirectories recursively", async () => {
    const since = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src", "index.ts"), "export {}");

    const files = await getModifiedFiles(tempDir, since);

    expect(files.length).toBe(1);
    expect(files[0].path).toContain("src/index.ts");
    expect(files[0].content).toBe("export {}");
  });

  it("should exclude node_modules and .git directories", async () => {
    const since = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    await mkdir(join(tempDir, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(tempDir, "node_modules", "pkg", "index.js"), "module.exports = {}");
    await mkdir(join(tempDir, ".git", "objects"), { recursive: true });
    await writeFile(join(tempDir, ".git", "objects", "abc"), "blob");
    await writeFile(join(tempDir, "app.ts"), "console.log('hi')");

    const files = await getModifiedFiles(tempDir, since);

    expect(files.length).toBe(1);
    expect(files[0].path).toContain("app.ts");
  });

  it("should skip binary files gracefully", async () => {
    const since = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    // Write a binary file
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]);
    await Bun.write(join(tempDir, "image.png"), buf);
    await writeFile(join(tempDir, "text.ts"), "hello");

    const files = await getModifiedFiles(tempDir, since);

    const paths = files.map((f) => f.path);
    expect(paths.some((p) => p.includes("text.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("image.png"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent-runner && bun test services/__test__/file-scanner.test.ts`
Expected: FAIL — cannot find module `../file-scanner`

- [ ] **Step 3: Implement getModifiedFiles**

```typescript
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { FileSnapshot } from "../types";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv",
  "dist", "build", ".next", ".nuxt", ".turbo", ".cache",
  ".DS_Store", "coverage", ".nyc_output",
]);

function isBinary(buffer: Buffer): boolean {
  // Check for null bytes in the first 512 bytes
  const len = Math.min(buffer.length, 512);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export async function getModifiedFiles(rootDir: string, since: number): Promise<FileSnapshot[]> {
  const results: FileSnapshot[] = [];

  async function scan(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        if (info.mtimeMs > since) {
          const buffer = await readFile(fullPath);
          if (!isBinary(buffer)) {
            results.push({
              path: fullPath,
              content: buffer.toString("utf-8"),
            });
          }
        }
      }
    }
  }

  await scan(rootDir);
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/agent-runner && bun test services/__test__/file-scanner.test.ts`
Expected: 5 pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add packages/agent-runner/services/file-scanner.ts packages/agent-runner/services/__test__/file-scanner.test.ts
git commit -m "feat(agent-runner): add mtime-based modified file scanner with tests"
```

---

### Task 4: Agent Routes — /health and /stop

**Files:**

- Create: `packages/agent-runner/routes/agent.ts`
- Create: `packages/agent-runner/routes/__test__/agent.test.ts`

- [ ] **Step 1: Write failing tests for /health and /stop**

```typescript
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createAgentRoutes } from "../agent";

function createApp() {
  const routes = createAgentRoutes();
  const app = new Hono();
  app.route("/", routes);
  return app;
}

describe("GET /health", () => {
  it("should return status ok", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});

describe("POST /stop", () => {
  it("should return ok false when no agent is running", async () => {
    const app = createApp();
    const res = await app.request("/stop", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent-runner && bun test routes/__test__/agent.test.ts`
Expected: FAIL — cannot find module `../agent`

- [ ] **Step 3: Implement routes with factory pattern**

```typescript
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createAgent as sdkCreateAgent, AnthropicProvider } from "@code-artisan/agent";
import type { AssistantMessage, ToolMessage, UserMessage } from "@code-artisan/agent";
import type { InvokeRequest, InvokeConfig, RunnerEvent } from "../types";
import { getModifiedFiles } from "../services/file-scanner";

const WORK_DIR = process.env.WORK_DIR ?? "/home/user";

interface AgentFactory {
  createAgent: (config: InvokeConfig) => {
    invoke: (msg: UserMessage) => AsyncGenerator<AssistantMessage | ToolMessage>;
  };
}

const defaultFactory: AgentFactory = {
  createAgent: (config) => {
    const provider = new AnthropicProvider(config.model, {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    return sdkCreateAgent({
      model: provider,
      prompt: config.prompt,
      maxSteps: config.maxSteps,
      skillsDirs: [],
    });
  },
};

export function createAgentRoutes(factory: AgentFactory = defaultFactory): Hono {
  let runningAbortController: AbortController | null = null;
  const routes = new Hono();

  routes.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  routes.post("/stop", (c) => {
    if (!runningAbortController) {
      return c.json({ ok: false });
    }
    runningAbortController.abort();
    runningAbortController = null;
    return c.json({ ok: true });
  });

  routes.post("/invoke", async (c) => {
    if (runningAbortController) {
      return c.json({ error: "Agent is already running" }, 409);
    }

    const body = (await c.req.json()) as InvokeRequest;
    const { message, files, config } = body;

    // Restore files to disk
    for (const file of files) {
      const dir = file.path.substring(0, file.path.lastIndexOf("/"));
      await Bun.spawn(["mkdir", "-p", dir]).exited;
      await Bun.write(file.path, file.content);
    }

    const agent = factory.createAgent(config);
    const ac = new AbortController();
    runningAbortController = ac;
    const invokeStartTime = Date.now();

    return streamSSE(c, async (stream) => {
      let totalUsage = { inputTokens: 0, outputTokens: 0 };

      try {
        for await (const msg of agent.invoke(message)) {
          if (ac.signal.aborted) break;

          const event: RunnerEvent = {
            type: msg.role as "assistant" | "tool",
            message: msg,
          } as RunnerEvent;
          await stream.writeSSE({ data: JSON.stringify(event) });

          // Accumulate token usage
          if (msg.role === "assistant" && (msg as AssistantMessage).usage) {
            const u = (msg as AssistantMessage).usage!;
            totalUsage.inputTokens += u.inputTokens;
            totalUsage.outputTokens += u.outputTokens;
          }
        }

        // Scan for modified files after agent finishes
        const modifiedFiles = await getModifiedFiles(WORK_DIR, invokeStartTime);
        if (modifiedFiles.length > 0) {
          const fileEvent: RunnerEvent = { type: "file", files: modifiedFiles };
          await stream.writeSSE({ data: JSON.stringify(fileEvent) });
        }

        const doneEvent: RunnerEvent = { type: "done", usage: totalUsage };
        await stream.writeSSE({ data: JSON.stringify(doneEvent) });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errorEvent: RunnerEvent = { type: "error", error: errMsg };
        await stream.writeSSE({ data: JSON.stringify(errorEvent) });
      } finally {
        runningAbortController = null;
      }
    });
  });

  return routes;
}

// Default instance for index.ts
export const agentRoutes = createAgentRoutes();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/agent-runner && bun test routes/__test__/agent.test.ts`
Expected: 2 pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add packages/agent-runner/routes/agent.ts packages/agent-runner/routes/__test__/agent.test.ts
git commit -m "feat(agent-runner): add routes with factory pattern, /health and /stop"
```

---

### Task 5: Agent Routes — /invoke Tests

**Files:**

- Modify: `packages/agent-runner/routes/__test__/agent.test.ts`

- [ ] **Step 1: Add /invoke tests**

Append to `routes/__test__/agent.test.ts`:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { Hono } from "hono";
import { createAgentRoutes } from "../agent";
import type { InvokeRequest } from "../../types";

function createTestApp(mockAgentInvoke?: Function) {
  const routes = createAgentRoutes({
    createAgent: (_config) => ({
      invoke: mockAgentInvoke ?? (async function* () {})(),
    }),
  });
  const app = new Hono();
  app.route("/", routes);
  return app;
}

const validRequest: InvokeRequest = {
  message: { role: "user", content: [{ type: "text", text: "Hello" }] },
  history: [],
  files: [],
  config: {
    model: "claude-sonnet-4-20250514",
    apiKey: "sk-test",
    prompt: "You are helpful.",
  },
};

function parseSSE(text: string): unknown[] {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) return null;
      return JSON.parse(dataLine.replace("data: ", ""));
    })
    .filter(Boolean);
}

describe("POST /invoke", () => {
  it("should return 409 if agent is already running", async () => {
    const neverResolve = async function* () {
      await new Promise(() => {});
    };

    const app = createTestApp(neverResolve);

    // Start first invoke (don't await — it hangs by design)
    app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    // Wait a tick for the first request to set runningAbortController
    await new Promise((r) => setTimeout(r, 10));

    const second = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(second.status).toBe(409);
  });

  it("should stream assistant and tool messages as SSE", async () => {
    const assistantMsg = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "Hello!" }],
    };
    const toolMsg = {
      role: "tool" as const,
      content: [{ type: "tool_result" as const, tool_use_id: "c1", content: "OK" }],
    };

    const fakeInvoke = async function* () {
      yield assistantMsg;
      yield toolMsg;
    };

    const app = createTestApp(fakeInvoke);
    const res = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = parseSSE(await res.text());

    expect((events[0] as any).type).toBe("assistant");
    expect((events[0] as any).message).toEqual(assistantMsg);
    expect((events[1] as any).type).toBe("tool");
    expect((events[1] as any).message).toEqual(toolMsg);
    expect((events[events.length - 1] as any).type).toBe("done");
  });

  it("should emit error event on agent failure", async () => {
    const fakeInvoke = async function* () {
      throw new Error("LLM timeout");
    };

    const app = createTestApp(fakeInvoke);
    const res = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    const events = parseSSE(await res.text());
    const errorEvent = events.find((e: any) => (e as any).type === "error") as any;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error).toContain("LLM timeout");
  });

  it("should reset running state after invoke completes", async () => {
    const fakeInvoke = async function* () {
      yield {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Done" }],
      };
    };

    const app = createTestApp(fakeInvoke);

    // First invoke
    const res1 = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });
    await res1.text(); // consume stream

    // Second invoke should succeed (not 409)
    const res2 = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });
    expect(res2.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/agent-runner && bun test`
Expected: All pass (2 health/stop + 4 invoke)

- [ ] **Step 3: Commit**

```bash
git add packages/agent-runner/routes/__test__/agent.test.ts
git commit -m "test(agent-runner): add /invoke SSE streaming tests"
```

---

### Task 6: Type Check and Full Verification

**Files:**

- Possibly fix: any type errors across `packages/agent-runner/`

- [ ] **Step 1: Run type check**

Run: `cd packages/agent-runner && bun run check`
Expected: No errors

- [ ] **Step 2: Run full test suite for agent-runner**

Run: `cd packages/agent-runner && bun test`
Expected: All pass

- [ ] **Step 3: Run agent SDK tests to confirm no regressions**

Run: `cd packages/agent && bun test`
Expected: 93 pass, 0 fail

- [ ] **Step 4: Commit any fixes**

```bash
git add -A packages/agent-runner/
git commit -m "fix(agent-runner): resolve type check and test issues"
```

---

### Summary

| Task | What it builds | Tests |
| --- | --- | --- |
| 1 | Package scaffolding (package.json, tsconfig, index.ts) | - |
| 2 | SSE event types and request/response types | - |
| 3 | mtime-based modified file scanner | 5 tests |
| 4 | Routes: /health, /stop, /invoke implementation | 2 tests |
| 5 | /invoke SSE streaming tests | 4 tests |
| 6 | Type check + full verification | - |

Total: 6 tasks, ~11 tests, covers the complete agent-runner package.
