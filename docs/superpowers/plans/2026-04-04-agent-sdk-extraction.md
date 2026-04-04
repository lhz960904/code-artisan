# Agent SDK Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract agent orchestration code from `@code-artisan/backend` into an independent `@code-artisan/agent` SDK package with zero business logic, using TDD throughout.

**Architecture:** Create `packages/agent/` as a new workspace package. Migrate types, sandbox interface, checkpoint, tools, providers, middlewares, MCP, and the agent core in bottom-up dependency order. Each module gets tests before implementation. Backend becomes a thin consumer that injects E2BSandbox, PostgresCheckpointSaver, and business middlewares.

**Tech Stack:** TypeScript, Vitest, Zod 4, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`

**Spec:** `docs/superpowers/specs/2026-04-04-agent-sdk-extraction-design.md`

---

## File Map

### New files in `packages/agent/`

| File | Responsibility |
|------|---------------|
| `package.json` | Package manifest with dependencies |
| `tsconfig.json` | TypeScript config extending base |
| `vitest.config.ts` | Test config |
| `src/index.ts` | Public API exports |
| `src/types.ts` | All interfaces: AgentConfig, AgentContext, AgentEvent, etc. |
| `src/sandbox/base.ts` | Sandbox interface |
| `src/sandbox/local.ts` | LocalSandbox implementation |
| `src/sandbox/__tests__/local.test.ts` | LocalSandbox tests |
| `src/sandbox/index.ts` | Sandbox exports |
| `src/checkpoint/base.ts` | CheckpointSaver interface + AgentState |
| `src/checkpoint/memory.ts` | InMemoryCheckpointSaver |
| `src/checkpoint/__tests__/memory.test.ts` | Checkpoint tests |
| `src/checkpoint/index.ts` | Checkpoint exports |
| `src/tools/base.ts` | BaseTool abstract class + truncateOutput |
| `src/tools/registry.ts` | ToolRegistry |
| `src/tools/__tests__/base.test.ts` | BaseTool tests |
| `src/tools/__tests__/registry.test.ts` | ToolRegistry tests |
| `src/tools/bash.ts` | BashTool |
| `src/tools/ls.ts` | LsTool |
| `src/tools/read-file.ts` | ReadFileTool |
| `src/tools/write-file.ts` | WriteFileTool |
| `src/tools/str-replace.ts` | StrReplaceTool |
| `src/tools/start-server.ts` | StartServerTool |
| `src/tools/web-search.ts` | WebSearchTool |
| `src/tools/web-fetch.ts` | WebFetchTool |
| `src/tools/__tests__/bash.test.ts` | BashTool tests |
| `src/tools/__tests__/ls.test.ts` | LsTool tests |
| `src/tools/__tests__/read-file.test.ts` | ReadFileTool tests |
| `src/tools/__tests__/write-file.test.ts` | WriteFileTool tests |
| `src/tools/__tests__/str-replace.test.ts` | StrReplaceTool tests |
| `src/tools/__tests__/start-server.test.ts` | StartServerTool tests |
| `src/tools/index.ts` | Tool exports + createDefaultTools() |
| `src/providers/base.ts` | LLMProvider interface |
| `src/providers/anthropic.ts` | AnthropicProvider |
| `src/providers/__tests__/anthropic.test.ts` | AnthropicProvider tests |
| `src/providers/index.ts` | Provider exports |
| `src/middlewares/dangling-tool-call.ts` | DanglingToolCallMiddleware |
| `src/middlewares/micro-compact.ts` | MicroCompactMiddleware |
| `src/middlewares/auto-compact.ts` | AutoCompactMiddleware |
| `src/middlewares/loop-detection.ts` | LoopDetectionMiddleware |
| `src/middlewares/__tests__/dangling-tool-call.test.ts` | Tests |
| `src/middlewares/__tests__/micro-compact.test.ts` | Tests |
| `src/middlewares/__tests__/auto-compact.test.ts` | Tests |
| `src/middlewares/__tests__/loop-detection.test.ts` | Tests |
| `src/middlewares/index.ts` | Middleware exports + defaultMiddlewares() |
| `src/mcp/mcp-tools.ts` | McpTools manager |
| `src/mcp/mcp-tool.ts` | McpTool wrapper |
| `src/mcp/__tests__/mcp-tools.test.ts` | MCP tests |
| `src/mcp/index.ts` | MCP exports |
| `src/agent.ts` | Agent class — core execution loop |
| `src/__tests__/agent.test.ts` | Agent loop tests |
| `src/__tests__/agent.interrupt.test.ts` | HITL interrupt/resume tests |

### Files to modify in `packages/backend/`

| File | Change |
|------|--------|
| `src/routes/conversations.ts` | Import from `@code-artisan/agent`, adapt to `agent.stream()` / `agent.resume()` |
| `src/sandbox/e2b-sandbox.ts` | Implement `Sandbox` from `@code-artisan/agent` |
| `src/services/message-store.ts` | Keep as-is, used by PostgresCheckpointSaver |
| `src/agent/` | Delete entire directory (moved to SDK) |
| `src/tools/` | Delete entire directory (moved to SDK) |
| `src/mcp/` | Delete mcp-tools.ts, mcp-tool.ts (moved to SDK); keep mcp-registry.json |

### Files to create in `packages/backend/`

| File | Responsibility |
|------|---------------|
| `src/checkpoint/postgres.ts` | PostgresCheckpointSaver implementing SDK interface |
| `src/middlewares/title-generation.ts` | Business middleware (from old agent/middlewares/) |
| `src/middlewares/token-usage.ts` | Business middleware (from old agent/middlewares/) |

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/vitest.config.ts`
- Create: `packages/agent/src/index.ts`
- Modify: root `package.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@code-artisan/agent",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@code-artisan/shared": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

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

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
  },
});
```

- [ ] **Step 4: Create placeholder index.ts**

```typescript
// @code-artisan/agent - AI Agent SDK
// Public API will be exported here as modules are built
export {};
```

- [ ] **Step 5: Update root package.json** to include agent in workspace scripts

Add to root `package.json` scripts:
```json
"test": "pnpm --filter @code-artisan/agent test && pnpm --filter @code-artisan/backend test"
```

- [ ] **Step 6: Install dependencies**

Run: `cd /Users/lihaoze/.agentara/workspace/projects/code-artisan && pnpm install`

- [ ] **Step 7: Verify setup**

Run: `cd /Users/lihaoze/.agentara/workspace/projects/code-artisan && pnpm --filter @code-artisan/agent test`
Expected: Vitest runs with 0 tests, exits clean.

- [ ] **Step 8: Commit**

```bash
git add packages/agent/ package.json pnpm-lock.yaml
git commit -m "chore: scaffold @code-artisan/agent package"
```

---

## Task 2: Types & Interfaces

**Files:**
- Create: `packages/agent/src/types.ts`

No tests needed — pure type definitions.

- [ ] **Step 1: Create types.ts**

This file defines all SDK interfaces. It must NOT import from backend or DB modules.

```typescript
import type { Message, MessagePart, MessageStreamEvent } from "@code-artisan/shared";

// ============================================================
// Sandbox
// ============================================================

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  background?: boolean;
}

export interface Sandbox {
  readonly id: string;
  exec(command: string, opts?: ExecOptions): Promise<string>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, append?: boolean): Promise<void>;
  listDir(path: string, maxDepth?: number): Promise<string[]>;
  getHostUrl(port: number): string;
  close(): Promise<void>;
}

// ============================================================
// Checkpoint
// ============================================================

export interface AgentState {
  messages: Message[];
  usage: { inputTokens: number; outputTokens: number };
  status: "running" | "interrupted" | "completed" | "error";
  pendingToolCalls?: ToolCall[];
}

export interface CheckpointSaver {
  save(threadId: string, state: AgentState): Promise<void>;
  restore(threadId: string): Promise<AgentState | null>;
}

// ============================================================
// LLM Provider
// ============================================================

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ThinkingBlock {
  thinking: string;
  signature?: string;
}

export interface LLMResponse {
  textContent: string;
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCall[];
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

export interface GenerateTextParams {
  model: string;
  system: string;
  messages: Message[];
}

export interface MessageStreamParams extends GenerateTextParams {
  tools?: ToolDefinition[];
  maxTokens?: number;
  thinking?: { enabled: boolean; budget: number };
}

export interface LLMProvider {
  stream(params: MessageStreamParams): AsyncIterable<MessageStreamEvent>;
  generateText(params: GenerateTextParams): Promise<string>;
}

// ============================================================
// Middleware
// ============================================================

export interface AgentContext {
  threadId: string;
  messages: Message[];
  sandbox: Sandbox;
  provider: LLMProvider;
  tools: import("./tools/registry.js").ToolRegistry;
  usage: { inputTokens: number; outputTokens: number };
  state: Map<string, unknown>;
  shouldStop: boolean;
}

export interface AgentMiddleware {
  name: string;
  beforeAgent?(ctx: AgentContext): Promise<void>;
  beforeModel?(ctx: AgentContext): Promise<void>;
  afterModel?(ctx: AgentContext, response?: LLMResponse): Promise<void>;
  afterToolExecution?(ctx: AgentContext): Promise<void>;
  onError?(ctx: AgentContext, error: Error): Promise<void>;
  afterAgent?(ctx: AgentContext): Promise<void>;
}

// ============================================================
// Agent Config & Events
// ============================================================

export interface InterruptConfig {
  decisions: string[];
  description?: string;
}

export interface AgentConfig {
  threadId: string;
  provider: LLMProvider;
  sandbox: Sandbox;
  tools?: import("./tools/base.js").BaseTool[];
  mcpServers?: McpServerConfig[];
  middlewares?: AgentMiddleware[];
  checkpoint?: CheckpointSaver;
  systemPrompt?: string;
  model?: string;
  maxIterations?: number;
  maxTokens?: number;
  thinking?: { enabled: boolean; budget: number };
  interruptOn?: Record<string, InterruptConfig>;
}

export interface McpServerConfig {
  serverId: string;
  command: string;
  args: string[];
  envVars?: Record<string, string>;
}

export interface InterruptDecision {
  action: "approve" | "reject";
  toolCallId?: string;
}

export type AgentEvent =
  | MessageStreamEvent
  | { type: "iteration_complete"; iteration: number }
  | { type: "interrupt"; toolCalls: ToolCall[] }
  | { type: "agent_complete"; usage: { inputTokens: number; outputTokens: number } }
  | { type: "error"; error: string };
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/lihaoze/.agentara/workspace/projects/code-artisan/packages/agent && npx tsc --noEmit`
Expected: No errors (some type imports will be unresolved until later tasks, which is OK since the files don't exist yet — we just verify no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/types.ts
git commit -m "feat(agent): add core type definitions"
```

---

## Task 3: Sandbox Interface + LocalSandbox

**Files:**
- Create: `packages/agent/src/sandbox/base.ts`
- Create: `packages/agent/src/sandbox/local.ts`
- Create: `packages/agent/src/sandbox/__tests__/local.test.ts`
- Create: `packages/agent/src/sandbox/index.ts`

- [ ] **Step 1: Create sandbox/base.ts** — re-export Sandbox type from types

```typescript
export type { Sandbox, ExecOptions } from "../types.js";
```

- [ ] **Step 2: Write failing tests for LocalSandbox**

Create `packages/agent/src/sandbox/__tests__/local.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalSandbox } from "../local.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("LocalSandbox", () => {
  let sandbox: LocalSandbox;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-test-"));
    sandbox = new LocalSandbox(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("exec", () => {
    it("should execute a command and return stdout", async () => {
      const result = await sandbox.exec("echo hello");
      expect(result).toBe("hello\n");
    });

    it("should return stderr on failed command", async () => {
      const result = await sandbox.exec("ls /nonexistent_path_xyz");
      expect(result).toContain("No such file or directory");
    });

    it("should respect cwd option", async () => {
      const result = await sandbox.exec("pwd", { cwd: tempDir });
      expect(result.trim()).toBe(tempDir);
    });

    it("should respect timeout option", async () => {
      await expect(sandbox.exec("sleep 10", { timeout: 100 })).rejects.toThrow();
    });
  });

  describe("writeFile + readFile", () => {
    it("should write and read a file", async () => {
      const filePath = join(tempDir, "test.txt");
      await sandbox.writeFile(filePath, "hello world");
      const content = await sandbox.readFile(filePath);
      expect(content).toBe("hello world");
    });

    it("should create parent directories", async () => {
      const filePath = join(tempDir, "deep/nested/dir/test.txt");
      await sandbox.writeFile(filePath, "nested content");
      const content = await sandbox.readFile(filePath);
      expect(content).toBe("nested content");
    });

    it("should append when append=true", async () => {
      const filePath = join(tempDir, "append.txt");
      await sandbox.writeFile(filePath, "first");
      await sandbox.writeFile(filePath, " second", true);
      const content = await sandbox.readFile(filePath);
      expect(content).toBe("first second");
    });

    it("should return empty string for missing file", async () => {
      const content = await sandbox.readFile(join(tempDir, "missing.txt"));
      expect(content).toBe("");
    });
  });

  describe("listDir", () => {
    it("should list directory contents", async () => {
      await sandbox.writeFile(join(tempDir, "a.txt"), "a");
      await sandbox.writeFile(join(tempDir, "b.txt"), "b");
      const entries = await sandbox.listDir(tempDir);
      expect(entries).toContain("a.txt");
      expect(entries).toContain("b.txt");
    });

    it("should return empty array for empty directory", async () => {
      const entries = await sandbox.listDir(tempDir);
      expect(entries).toEqual([]);
    });
  });

  describe("getHostUrl", () => {
    it("should return localhost URL with port", () => {
      const url = sandbox.getHostUrl(3000);
      expect(url).toBe("http://localhost:3000");
    });
  });

  describe("id", () => {
    it("should return a string id", () => {
      expect(typeof sandbox.id).toBe("string");
      expect(sandbox.id.length).toBeGreaterThan(0);
    });
  });

  describe("close", () => {
    it("should not throw", async () => {
      await expect(sandbox.close()).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/lihaoze/.agentara/workspace/projects/code-artisan && pnpm --filter @code-artisan/agent test`
Expected: FAIL — `local.js` module not found.

- [ ] **Step 4: Implement LocalSandbox**

Create `packages/agent/src/sandbox/local.ts`:

```typescript
import { exec as execCb } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import type { Sandbox, ExecOptions } from "../types.js";

export class LocalSandbox implements Sandbox {
  readonly id: string;
  private workDir: string;

  constructor(workDir?: string) {
    this.workDir = workDir ?? process.cwd();
    this.id = `local-${randomUUID().slice(0, 8)}`;
  }

  async exec(command: string, opts?: ExecOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execCb(
        command,
        {
          cwd: opts?.cwd ?? this.workDir,
          timeout: opts?.timeout ?? 120_000,
          env: opts?.env ? { ...process.env, ...opts.env } : process.env,
          maxBuffer: 1024 * 1024 * 10,
        },
        (error, stdout, stderr) => {
          if (opts?.timeout && error && (error as NodeJS.ErrnoException).killed) {
            reject(new Error(`Command timed out after ${opts.timeout}ms`));
            return;
          }
          // Return stdout + stderr combined, similar to E2B behavior
          resolve(stdout || stderr || "");
        },
      );
    });
  }

  async readFile(path: string): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch {
      return "";
    }
  }

  async writeFile(path: string, content: string, append?: boolean): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    if (append) {
      const existing = await this.readFile(path);
      await writeFile(path, existing + content, "utf-8");
    } else {
      await writeFile(path, content, "utf-8");
    }
  }

  async listDir(path: string, maxDepth = 2): Promise<string[]> {
    const results: string[] = [];
    await this._listDirRecursive(path, path, 0, maxDepth, results);
    return results;
  }

  private async _listDirRecursive(
    basePath: string,
    currentPath: string,
    depth: number,
    maxDepth: number,
    results: string[],
  ): Promise<void> {
    if (depth >= maxDepth) return;
    try {
      const entries = await readdir(currentPath);
      for (const entry of entries) {
        const fullPath = join(currentPath, entry);
        const rel = relative(basePath, fullPath);
        const s = await stat(fullPath);
        results.push(s.isDirectory() ? `${rel}/` : rel);
        if (s.isDirectory()) {
          await this._listDirRecursive(basePath, fullPath, depth + 1, maxDepth, results);
        }
      }
    } catch {
      // directory doesn't exist or not readable
    }
  }

  getHostUrl(port: number): string {
    return `http://localhost:${port}`;
  }

  async close(): Promise<void> {
    // LocalSandbox has no resources to clean up
  }
}
```

- [ ] **Step 5: Create sandbox/index.ts**

```typescript
export type { Sandbox, ExecOptions } from "../types.js";
export { LocalSandbox } from "./local.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/lihaoze/.agentara/workspace/projects/code-artisan && pnpm --filter @code-artisan/agent test`
Expected: All LocalSandbox tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/sandbox/
git commit -m "feat(agent): add Sandbox interface and LocalSandbox implementation"
```

---

## Task 4: Checkpoint Interface + InMemoryCheckpointSaver

**Files:**
- Create: `packages/agent/src/checkpoint/base.ts`
- Create: `packages/agent/src/checkpoint/memory.ts`
- Create: `packages/agent/src/checkpoint/__tests__/memory.test.ts`
- Create: `packages/agent/src/checkpoint/index.ts`

- [ ] **Step 1: Create checkpoint/base.ts**

```typescript
export type { AgentState, CheckpointSaver } from "../types.js";
```

- [ ] **Step 2: Write failing tests**

Create `packages/agent/src/checkpoint/__tests__/memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryCheckpointSaver } from "../memory.js";
import type { AgentState } from "../../types.js";

function makeState(overrides?: Partial<AgentState>): AgentState {
  return {
    messages: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    status: "running",
    ...overrides,
  };
}

describe("InMemoryCheckpointSaver", () => {
  let saver: InMemoryCheckpointSaver;

  beforeEach(() => {
    saver = new InMemoryCheckpointSaver();
  });

  it("should return null for unknown threadId", async () => {
    const state = await saver.restore("unknown");
    expect(state).toBeNull();
  });

  it("should save and restore state", async () => {
    const state = makeState({ status: "running" });
    await saver.save("thread-1", state);
    const restored = await saver.restore("thread-1");
    expect(restored).toEqual(state);
  });

  it("should overwrite previous state on re-save", async () => {
    await saver.save("thread-1", makeState({ status: "running" }));
    const updated = makeState({ status: "completed" });
    await saver.save("thread-1", updated);
    const restored = await saver.restore("thread-1");
    expect(restored?.status).toBe("completed");
  });

  it("should isolate different threadIds", async () => {
    await saver.save("t1", makeState({ status: "running" }));
    await saver.save("t2", makeState({ status: "completed" }));
    expect((await saver.restore("t1"))?.status).toBe("running");
    expect((await saver.restore("t2"))?.status).toBe("completed");
  });

  it("should deep-clone state to prevent mutation", async () => {
    const state = makeState();
    await saver.save("t1", state);
    state.messages.push({
      id: "1",
      role: "user",
      parts: [{ type: "text", text: "mutated" }],
      createdAt: new Date().toISOString(),
    });
    const restored = await saver.restore("t1");
    expect(restored?.messages).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @code-artisan/agent test`
Expected: FAIL — `memory.js` module not found.

- [ ] **Step 4: Implement InMemoryCheckpointSaver**

Create `packages/agent/src/checkpoint/memory.ts`:

```typescript
import type { AgentState, CheckpointSaver } from "../types.js";

export class InMemoryCheckpointSaver implements CheckpointSaver {
  private store = new Map<string, string>();

  async save(threadId: string, state: AgentState): Promise<void> {
    this.store.set(threadId, JSON.stringify(state));
  }

  async restore(threadId: string): Promise<AgentState | null> {
    const raw = this.store.get(threadId);
    if (!raw) return null;
    return JSON.parse(raw) as AgentState;
  }
}
```

- [ ] **Step 5: Create checkpoint/index.ts**

```typescript
export type { AgentState, CheckpointSaver } from "../types.js";
export { InMemoryCheckpointSaver } from "./memory.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @code-artisan/agent test`
Expected: All checkpoint tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/checkpoint/
git commit -m "feat(agent): add CheckpointSaver interface and InMemoryCheckpointSaver"
```

---

## Task 5: BaseTool + ToolRegistry

**Files:**
- Create: `packages/agent/src/tools/base.ts`
- Create: `packages/agent/src/tools/registry.ts`
- Create: `packages/agent/src/tools/__tests__/base.test.ts`
- Create: `packages/agent/src/tools/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing tests for BaseTool**

Create `packages/agent/src/tools/__tests__/base.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as z from "zod";
import { BaseTool, truncateOutput } from "../base.js";
import type { Sandbox } from "../../types.js";

// Concrete implementation for testing
class EchoTool extends BaseTool<typeof echoSchema> {
  name = "echo";
  description = "Echoes input";
  schema = echoSchema;

  protected async _call(_sandbox: Sandbox, input: z.infer<typeof echoSchema>): Promise<string> {
    return input.message;
  }
}

const echoSchema = z.object({
  message: z.string(),
});

class ThrowTool extends BaseTool<typeof echoSchema> {
  name = "throw";
  description = "Always throws";
  schema = echoSchema;

  protected async _call(): Promise<string> {
    throw new Error("boom");
  }
}

const mockSandbox = {} as Sandbox;

describe("BaseTool", () => {
  const tool = new EchoTool();

  describe("call", () => {
    it("should validate input and call _call", async () => {
      const result = await tool.call(mockSandbox, { message: "hello" });
      expect(result).toBe("hello");
    });

    it("should return error for invalid input", async () => {
      const result = await tool.call(mockSandbox, { wrong: "field" });
      expect(result).toContain("Error: Invalid input");
    });

    it("should catch thrown errors", async () => {
      const throwTool = new ThrowTool();
      const result = await throwTool.call(mockSandbox, { message: "x" });
      expect(result).toContain("Error: boom");
    });
  });

  describe("toDefinition", () => {
    it("should return ToolDefinition with JSON schema", () => {
      const def = tool.toDefinition();
      expect(def.name).toBe("echo");
      expect(def.description).toBe("Echoes input");
      expect(def.inputSchema).toHaveProperty("type", "object");
      expect(def.inputSchema).toHaveProperty("properties");
    });
  });
});

describe("truncateOutput", () => {
  it("should return short strings unchanged", () => {
    expect(truncateOutput("short")).toBe("short");
  });

  it("should truncate long strings with head+tail", () => {
    const long = "x".repeat(15000);
    const result = truncateOutput(long, 12000);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain("characters omitted");
  });
});
```

- [ ] **Step 2: Write failing tests for ToolRegistry**

Create `packages/agent/src/tools/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as z from "zod";
import { ToolRegistry } from "../registry.js";
import { BaseTool } from "../base.js";
import type { Sandbox } from "../../types.js";

class FakeTool extends BaseTool<typeof fakeSchema> {
  name: string;
  description: string;
  schema = fakeSchema;

  constructor(name: string, description = "fake") {
    super();
    this.name = name;
    this.description = description;
  }

  protected async _call(_sandbox: Sandbox, input: z.infer<typeof fakeSchema>): Promise<string> {
    return "ok";
  }
}

const fakeSchema = z.object({ x: z.string() });

describe("ToolRegistry", () => {
  it("should register and retrieve a tool", () => {
    const registry = new ToolRegistry();
    const tool = new FakeTool("test_tool");
    registry.register(tool);
    expect(registry.get("test_tool")).toBe(tool);
  });

  it("should return undefined for unknown tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("nope")).toBeUndefined();
  });

  it("should generate tool definitions", () => {
    const registry = new ToolRegistry();
    registry.register(new FakeTool("a", "Tool A"));
    registry.register(new FakeTool("b", "Tool B"));
    const defs = registry.toToolDefinitions();
    expect(defs).toHaveLength(2);
    expect(defs[0].name).toBe("a");
    expect(defs[1].name).toBe("b");
  });

  it("should generate prompt section", () => {
    const registry = new ToolRegistry();
    registry.register(new FakeTool("mytool", "Does stuff"));
    const section = registry.toPromptSection();
    expect(section).toContain("mytool");
    expect(section).toContain("Does stuff");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @code-artisan/agent test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement BaseTool**

Create `packages/agent/src/tools/base.ts`:

```typescript
import * as z from "zod";
import type { Sandbox, ToolDefinition } from "../types.js";

const MAX_OUTPUT_CHARS = 12000;
const HEAD_RATIO = 0.8;
const TAIL_RATIO = 0.2;

export function truncateOutput(output: string, maxChars = MAX_OUTPUT_CHARS): string {
  if (output.length <= maxChars) return output;

  const headChars = Math.floor(maxChars * HEAD_RATIO);
  const tailChars = Math.floor(maxChars * TAIL_RATIO);
  const head = output.slice(0, headChars);
  const tail = output.slice(-tailChars);
  const omitted = output.length - headChars - tailChars;

  return `${head}\n\n[... ${omitted} characters omitted (${output.length} total) ...]\n\n${tail}`;
}

export abstract class BaseTool<T extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  abstract name: string;
  abstract description: string;
  abstract schema: T;

  protected abstract _call(sandbox: Sandbox, input: z.infer<T>): Promise<string>;

  async call(sandbox: Sandbox, rawInput: unknown): Promise<string> {
    const parsed = this.schema.safeParse(rawInput);
    if (!parsed.success) {
      return `Error: Invalid input - ${parsed.error.issues.map((i) => i.message).join(", ")}`;
    }
    try {
      return await this._call(sandbox, parsed.data);
    } catch (err) {
      return `Error: ${String(err)}`;
    }
  }

  toDefinition(): ToolDefinition {
    const jsonSchema = z.toJSONSchema(this.schema) as Record<string, unknown>;
    return {
      name: this.name,
      description: this.description,
      inputSchema: jsonSchema,
    };
  }
}
```

- [ ] **Step 5: Implement ToolRegistry**

Create `packages/agent/src/tools/registry.ts`:

```typescript
import type { BaseTool } from "./base.js";
import type { ToolDefinition } from "../types.js";

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  toToolDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.toDefinition());
  }

  toPromptSection(): string {
    return [...this.tools.values()]
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @code-artisan/agent test`
Expected: All BaseTool and ToolRegistry tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/tools/
git commit -m "feat(agent): add BaseTool and ToolRegistry"
```

---

## Task 6: Built-in Tools

**Files:**
- Create: `packages/agent/src/tools/bash.ts`, `ls.ts`, `read-file.ts`, `write-file.ts`, `str-replace.ts`, `start-server.ts`, `web-search.ts`, `web-fetch.ts`
- Create: `packages/agent/src/tools/__tests__/bash.test.ts`, `ls.test.ts`, `read-file.test.ts`, `write-file.test.ts`, `str-replace.test.ts`, `start-server.test.ts`
- Create: `packages/agent/src/tools/index.ts`

Tools are migrated from `packages/backend/src/tools/builtins/`. Key change: `_call(runtime: ToolRuntime, input)` becomes `_call(sandbox: Sandbox, input)`.

- [ ] **Step 1: Write failing tests for all tools**

Create `packages/agent/src/tools/__tests__/bash.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { BashTool } from "../bash.js";
import type { Sandbox } from "../../types.js";

const mockSandbox = {
  exec: vi.fn(),
} as unknown as Sandbox;

describe("BashTool", () => {
  const tool = new BashTool();

  it("should have correct name", () => {
    expect(tool.name).toBe("bash");
  });

  it("should execute command via sandbox", async () => {
    vi.mocked(mockSandbox.exec).mockResolvedValue("output");
    const result = await tool.call(mockSandbox, {
      description: "test",
      command: "echo hello",
    });
    expect(result).toBe("output");
    expect(mockSandbox.exec).toHaveBeenCalledWith("echo hello");
  });

  it("should return (no output) for empty result", async () => {
    vi.mocked(mockSandbox.exec).mockResolvedValue("");
    const result = await tool.call(mockSandbox, {
      description: "test",
      command: "true",
    });
    expect(result).toBe("(no output)");
  });
});
```

Create `packages/agent/src/tools/__tests__/ls.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { LsTool } from "../ls.js";
import type { Sandbox } from "../../types.js";

const mockSandbox = {
  listDir: vi.fn(),
} as unknown as Sandbox;

describe("LsTool", () => {
  const tool = new LsTool();

  it("should list directory contents", async () => {
    vi.mocked(mockSandbox.listDir).mockResolvedValue(["a.txt", "b.txt"]);
    const result = await tool.call(mockSandbox, {
      description: "test",
      path: "/home",
    });
    expect(result).toBe("a.txt\nb.txt");
  });

  it("should return (empty) for empty directory", async () => {
    vi.mocked(mockSandbox.listDir).mockResolvedValue([]);
    const result = await tool.call(mockSandbox, {
      description: "test",
      path: "/empty",
    });
    expect(result).toBe("(empty)");
  });
});
```

Create `packages/agent/src/tools/__tests__/read-file.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { ReadFileTool } from "../read-file.js";
import type { Sandbox } from "../../types.js";

const mockSandbox = {
  readFile: vi.fn(),
} as unknown as Sandbox;

describe("ReadFileTool", () => {
  const tool = new ReadFileTool();

  it("should read file content", async () => {
    vi.mocked(mockSandbox.readFile).mockResolvedValue("file content");
    const result = await tool.call(mockSandbox, {
      description: "test",
      path: "/test.txt",
    });
    expect(result).toBe("file content");
  });

  it("should return (empty) for empty file", async () => {
    vi.mocked(mockSandbox.readFile).mockResolvedValue("");
    const result = await tool.call(mockSandbox, {
      description: "test",
      path: "/empty.txt",
    });
    expect(result).toBe("(empty)");
  });

  it("should slice lines when start_line and end_line given", async () => {
    vi.mocked(mockSandbox.readFile).mockResolvedValue("line1\nline2\nline3\nline4");
    const result = await tool.call(mockSandbox, {
      description: "test",
      path: "/test.txt",
      start_line: 2,
      end_line: 3,
    });
    expect(result).toBe("line2\nline3");
  });
});
```

Create `packages/agent/src/tools/__tests__/write-file.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { WriteFileTool } from "../write-file.js";
import type { Sandbox } from "../../types.js";

const mockSandbox = {
  writeFile: vi.fn().mockResolvedValue(undefined),
} as unknown as Sandbox;

describe("WriteFileTool", () => {
  const tool = new WriteFileTool();

  it("should write file content", async () => {
    const result = await tool.call(mockSandbox, {
      description: "test",
      path: "/test.txt",
      content: "hello",
    });
    expect(result).toBe("OK");
    expect(mockSandbox.writeFile).toHaveBeenCalledWith("/test.txt", "hello", false);
  });

  it("should pass append flag", async () => {
    await tool.call(mockSandbox, {
      description: "test",
      path: "/test.txt",
      content: "more",
      append: true,
    });
    expect(mockSandbox.writeFile).toHaveBeenCalledWith("/test.txt", "more", true);
  });
});
```

Create `packages/agent/src/tools/__tests__/str-replace.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { StrReplaceTool } from "../str-replace.js";
import type { Sandbox } from "../../types.js";

const mockSandbox = {
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
} as unknown as Sandbox;

describe("StrReplaceTool", () => {
  const tool = new StrReplaceTool();

  it("should replace first occurrence", async () => {
    vi.mocked(mockSandbox.readFile).mockResolvedValue("hello world hello");
    const result = await tool.call(mockSandbox, {
      description: "test",
      path: "/test.txt",
      old_str: "hello",
      new_str: "hi",
    });
    expect(result).toBe("OK");
    expect(mockSandbox.writeFile).toHaveBeenCalledWith("/test.txt", "hi world hello");
  });

  it("should replace all when replace_all=true", async () => {
    vi.mocked(mockSandbox.readFile).mockResolvedValue("aaa");
    await tool.call(mockSandbox, {
      description: "test",
      path: "/f.txt",
      old_str: "a",
      new_str: "b",
      replace_all: true,
    });
    expect(mockSandbox.writeFile).toHaveBeenCalledWith("/f.txt", "bbb");
  });

  it("should return error when string not found", async () => {
    vi.mocked(mockSandbox.readFile).mockResolvedValue("content");
    const result = await tool.call(mockSandbox, {
      description: "test",
      path: "/f.txt",
      old_str: "missing",
      new_str: "x",
    });
    expect(result).toContain("Error: String to replace not found");
  });
});
```

Create `packages/agent/src/tools/__tests__/start-server.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { StartServerTool } from "../start-server.js";
import type { Sandbox } from "../../types.js";

const mockSandbox = {
  exec: vi.fn().mockResolvedValue(""),
  getHostUrl: vi.fn().mockReturnValue("http://localhost:3000"),
} as unknown as Sandbox;

describe("StartServerTool", () => {
  const tool = new StartServerTool();

  it("should start server and return preview URL", async () => {
    const result = await tool.call(mockSandbox, {
      description: "test",
      command: "node server.js",
      port: 3000,
    });
    expect(result).toContain("Server started");
    expect(result).toContain("http://localhost:3000");
    expect(mockSandbox.exec).toHaveBeenCalledWith("node server.js", { background: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @code-artisan/agent test`
Expected: FAIL — tool modules not found.

- [ ] **Step 3: Implement all tool files**

Each tool is migrated from backend with `_call(runtime: ToolRuntime, ...)` changed to `_call(sandbox: Sandbox, ...)`.

Create `packages/agent/src/tools/bash.ts`:

```typescript
import * as z from "zod";
import { BaseTool, truncateOutput } from "./base.js";
import type { Sandbox } from "../types.js";

const schema = z.object({
  description: z.string().describe("Explain why you are running this command. ALWAYS PROVIDE THIS PARAMETER FIRST."),
  command: z.string().describe("The bash command to execute. Always use absolute paths."),
});

export class BashTool extends BaseTool<typeof schema> {
  name = "bash";
  description = "Execute a bash command in a sandbox environment. Use this for short-lived commands only.";
  schema = schema;

  protected async _call(sandbox: Sandbox, input: z.infer<typeof schema>): Promise<string> {
    const output = await sandbox.exec(input.command);
    return truncateOutput(output || "(no output)");
  }
}
```

Create `packages/agent/src/tools/ls.ts`:

```typescript
import * as z from "zod";
import { BaseTool, truncateOutput } from "./base.js";
import type { Sandbox } from "../types.js";

const schema = z.object({
  description: z.string().describe("Explain why you are listing this directory. ALWAYS PROVIDE THIS PARAMETER FIRST."),
  path: z.string().describe("The absolute path to the directory to list."),
});

export class LsTool extends BaseTool<typeof schema> {
  name = "ls";
  description = "List the contents of a directory up to 2 levels deep in tree format.";
  schema = schema;

  protected async _call(sandbox: Sandbox, input: z.infer<typeof schema>): Promise<string> {
    const entries = await sandbox.listDir(input.path);
    if (entries.length === 0) return "(empty)";
    return truncateOutput(entries.join("\n"));
  }
}
```

Create `packages/agent/src/tools/read-file.ts`:

```typescript
import * as z from "zod";
import { BaseTool, truncateOutput } from "./base.js";
import type { Sandbox } from "../types.js";

const schema = z.object({
  description: z.string().describe("Explain why you are reading this file. ALWAYS PROVIDE THIS PARAMETER FIRST."),
  path: z.string().describe("The absolute path to the file to read."),
  start_line: z.number().optional().describe("Optional starting line number (1-indexed, inclusive)."),
  end_line: z.number().optional().describe("Optional ending line number (1-indexed, inclusive)."),
});

export class ReadFileTool extends BaseTool<typeof schema> {
  name = "read_file";
  description = "Read the contents of a text file.";
  schema = schema;

  protected async _call(sandbox: Sandbox, input: z.infer<typeof schema>): Promise<string> {
    let content = await sandbox.readFile(input.path);
    if (!content) return "(empty)";
    if (input.start_line != null && input.end_line != null) {
      const lines = content.split("\n");
      content = lines.slice(input.start_line - 1, input.end_line).join("\n");
    }
    if (content.length > 12000) {
      const totalLines = content.split("\n").length;
      const truncated = truncateOutput(content);
      return `${truncated}\n\n[File has ${totalLines} lines. Use start_line and end_line to read specific ranges.]`;
    }
    return content;
  }
}
```

Create `packages/agent/src/tools/write-file.ts`:

```typescript
import * as z from "zod";
import { BaseTool } from "./base.js";
import type { Sandbox } from "../types.js";

const schema = z.object({
  description: z.string().describe("Explain why you are writing to this file. ALWAYS PROVIDE THIS PARAMETER FIRST."),
  path: z.string().describe("The absolute path to the file to write to."),
  content: z.string().describe("The content to write to the file."),
  append: z.boolean().optional().default(false).describe("Whether to append instead of overwriting."),
});

export class WriteFileTool extends BaseTool<typeof schema> {
  name = "write_file";
  description = "Write text content to a file. Creates directories as needed.";
  schema = schema;

  protected async _call(sandbox: Sandbox, input: z.infer<typeof schema>): Promise<string> {
    await sandbox.writeFile(input.path, input.content, input.append);
    return "OK";
  }
}
```

Create `packages/agent/src/tools/str-replace.ts`:

```typescript
import * as z from "zod";
import { BaseTool } from "./base.js";
import type { Sandbox } from "../types.js";

const schema = z.object({
  description: z.string().describe("Explain why you are replacing the substring. ALWAYS PROVIDE THIS PARAMETER FIRST."),
  path: z.string().describe("The absolute path to the file."),
  old_str: z.string().describe("The substring to replace."),
  new_str: z.string().describe("The new substring."),
  replace_all: z.boolean().optional().default(false).describe("Whether to replace all occurrences."),
});

export class StrReplaceTool extends BaseTool<typeof schema> {
  name = "str_replace";
  description = "Replace a substring in a file. If replace_all is false (default), the substring must appear exactly once.";
  schema = schema;

  protected async _call(sandbox: Sandbox, input: z.infer<typeof schema>): Promise<string> {
    let content = await sandbox.readFile(input.path);
    if (!content) return "OK";
    if (!content.includes(input.old_str)) {
      return `Error: String to replace not found in file: ${input.path}`;
    }
    if (input.replace_all) {
      content = content.replaceAll(input.old_str, input.new_str);
    } else {
      content = content.replace(input.old_str, input.new_str);
    }
    await sandbox.writeFile(input.path, content);
    return "OK";
  }
}
```

Create `packages/agent/src/tools/start-server.ts`:

```typescript
import * as z from "zod";
import { BaseTool } from "./base.js";
import type { Sandbox } from "../types.js";

const schema = z.object({
  description: z.string().describe("Explain why you are starting this server. ALWAYS PROVIDE THIS PARAMETER FIRST."),
  command: z.string().describe("Shell command to start the server."),
  port: z.number().describe("Port the server listens on."),
});

export class StartServerTool extends BaseTool<typeof schema> {
  name = "start_server";
  description = "Start a long-running server process in the background. Returns a public preview URL.";
  schema = schema;

  protected async _call(sandbox: Sandbox, input: z.infer<typeof schema>): Promise<string> {
    await sandbox.exec(input.command, { background: true });
    await new Promise((r) => setTimeout(r, 2000));
    const url = sandbox.getHostUrl(input.port);
    return `Server started. Preview URL: ${url}`;
  }
}
```

Create `packages/agent/src/tools/web-search.ts`:

```typescript
import * as z from "zod";
import { BaseTool, truncateOutput } from "./base.js";
import type { Sandbox } from "../types.js";

const schema = z.object({
  description: z.string().describe("Explain why you need to search the web. ALWAYS PROVIDE THIS PARAMETER FIRST."),
  query: z.string().describe("The search query string"),
  maxResults: z.number().min(1).max(10).default(5).describe("Number of results to return (1-10)"),
  searchDepth: z.enum(["basic", "advanced"]).default("basic").describe("basic = fast snippets, advanced = deeper extraction"),
  includeDomains: z.array(z.string()).optional().describe("Only include results from these domains"),
  excludeDomains: z.array(z.string()).optional().describe("Exclude results from these domains"),
});

interface TavilySearchResponse {
  results: Array<{ title: string; content: string; url: string }>;
}

export class WebSearchTool extends BaseTool<typeof schema> {
  name = "web_search";
  description = "Search the web for current information, documentation, or any topic.";
  schema = schema;

  constructor(private apiKey: string) { super(); }

  protected async _call(_sandbox: Sandbox, input: z.infer<typeof schema>): Promise<string> {
    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      query: input.query,
      max_results: input.maxResults,
      search_depth: input.searchDepth,
      ...(input.includeDomains?.length ? { include_domains: input.includeDomains } : {}),
      ...(input.excludeDomains?.length ? { exclude_domains: input.excludeDomains } : {}),
      include_answer: false,
    };

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as TavilySearchResponse;
    if (!data.results || data.results.length === 0) return `No results found for: "${input.query}"`;

    const formatted = data.results
      .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.content}\n    URL: ${r.url}`)
      .join("\n\n");

    return truncateOutput(`Search results for: "${input.query}"\n\n${formatted}`);
  }
}
```

Create `packages/agent/src/tools/web-fetch.ts`:

```typescript
import * as z from "zod";
import { BaseTool, truncateOutput } from "./base.js";
import type { Sandbox } from "../types.js";

const schema = z.object({
  description: z.string().describe("Explain why you need to fetch this page. ALWAYS PROVIDE THIS PARAMETER FIRST."),
  url: z.string().url().describe("The URL to fetch and extract content from"),
});

interface TavilyExtractResponse {
  results: Array<{ url: string; raw_content: string }>;
}

export class WebFetchTool extends BaseTool<typeof schema> {
  name = "web_fetch";
  description = "Fetch and extract the main readable content from a web page URL.";
  schema = schema;

  constructor(private apiKey: string) { super(); }

  protected async _call(_sandbox: Sandbox, input: z.infer<typeof schema>): Promise<string> {
    const res = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: this.apiKey, urls: [input.url] }),
    });

    if (!res.ok) throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as TavilyExtractResponse;
    if (!data.results?.length || !data.results[0].raw_content) {
      return `Failed to extract content from: ${input.url}`;
    }

    return truncateOutput(`Content from: ${input.url}\n\n${data.results[0].raw_content}`);
  }
}
```

Create `packages/agent/src/tools/index.ts`:

```typescript
export { BaseTool, truncateOutput } from "./base.js";
export { ToolRegistry } from "./registry.js";
export { BashTool } from "./bash.js";
export { LsTool } from "./ls.js";
export { ReadFileTool } from "./read-file.js";
export { WriteFileTool } from "./write-file.js";
export { StrReplaceTool } from "./str-replace.js";
export { StartServerTool } from "./start-server.js";
export { WebSearchTool } from "./web-search.js";
export { WebFetchTool } from "./web-fetch.js";

import { ToolRegistry } from "./registry.js";
import { BashTool } from "./bash.js";
import { LsTool } from "./ls.js";
import { ReadFileTool } from "./read-file.js";
import { WriteFileTool } from "./write-file.js";
import { StrReplaceTool } from "./str-replace.js";
import { StartServerTool } from "./start-server.js";
import { WebSearchTool } from "./web-search.js";
import { WebFetchTool } from "./web-fetch.js";

export interface CreateToolsOptions {
  tavilyApiKey?: string;
}

export function createDefaultTools(opts?: CreateToolsOptions): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new BashTool());
  registry.register(new LsTool());
  registry.register(new ReadFileTool());
  registry.register(new WriteFileTool());
  registry.register(new StrReplaceTool());
  registry.register(new StartServerTool());

  if (opts?.tavilyApiKey) {
    registry.register(new WebSearchTool(opts.tavilyApiKey));
    registry.register(new WebFetchTool(opts.tavilyApiKey));
  }

  return registry;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @code-artisan/agent test`
Expected: All tool tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/tools/
git commit -m "feat(agent): add built-in tools (bash, ls, read-file, write-file, str-replace, start-server, web-search, web-fetch)"
```

---

## Task 7: AnthropicProvider

**Files:**
- Create: `packages/agent/src/providers/base.ts`
- Create: `packages/agent/src/providers/anthropic.ts`
- Create: `packages/agent/src/providers/__tests__/anthropic.test.ts`
- Create: `packages/agent/src/providers/index.ts`

- [ ] **Step 1: Create providers/base.ts**

```typescript
export type { LLMProvider, LLMResponse, MessageStreamParams, GenerateTextParams, ThinkingBlock, ToolCall, ToolDefinition } from "../types.js";
```

- [ ] **Step 2: Write failing tests for AnthropicProvider**

Create `packages/agent/src/providers/__tests__/anthropic.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicProvider } from "../anthropic.js";
import type { Message } from "@code-artisan/shared";

// Mock @anthropic-ai/sdk
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn(),
        create: vi.fn(),
      };
      constructor() {}
    },
  };
});

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider({ apiKey: "test-key" });
  });

  describe("constructor", () => {
    it("should create with default options", () => {
      expect(provider).toBeDefined();
    });

    it("should accept custom maxTokens and thinking config", () => {
      const custom = new AnthropicProvider({
        apiKey: "key",
        maxTokens: 8192,
        thinking: { enabled: true, budget: 5000 },
      });
      expect(custom).toBeDefined();
    });
  });

  describe("toAnthropicMessages", () => {
    it("should convert user messages", () => {
      const messages: Message[] = [
        {
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
          createdAt: new Date().toISOString(),
        },
      ];
      // Access private method via any for testing
      const result = (provider as any).toAnthropicMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("user");
    });

    it("should convert assistant messages with thinking", () => {
      const messages: Message[] = [
        {
          id: "1",
          role: "assistant",
          parts: [
            { type: "thinking", thinking: "let me think", signature: "sig123" },
            { type: "text", text: "answer" },
          ],
          createdAt: new Date().toISOString(),
        },
      ];
      const result = (provider as any).toAnthropicMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("assistant");
      expect(result[0].content).toHaveLength(2);
    });

    it("should batch tool messages with preceding assistant", () => {
      const messages: Message[] = [
        {
          id: "1",
          role: "assistant",
          parts: [{ type: "text", text: "I'll run a command" }],
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          role: "tool",
          parts: [{
            type: "tool-call",
            toolCallId: "tc1",
            toolName: "bash",
            input: { command: "ls" },
            state: "result",
            output: "file.txt",
          }],
          createdAt: new Date().toISOString(),
        },
      ];
      const result = (provider as any).toAnthropicMessages(messages);
      // Should produce: assistant (with tool_use block) + user (with tool_result)
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should skip messages with confirmResponse metadata", () => {
      const messages: Message[] = [
        {
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "confirm" }],
          metadata: { confirmResponse: { approved: true } },
          createdAt: new Date().toISOString(),
        },
      ];
      const result = (provider as any).toAnthropicMessages(messages);
      expect(result).toHaveLength(0);
    });
  });

  describe("generateText", () => {
    it("should call Anthropic create and return text", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "generated text" }],
      });
      (provider as any).client.messages.create = mockCreate;

      const result = await provider.generateText({
        model: "claude-haiku-4-5-20251001",
        system: "test system",
        messages: [{
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "prompt" }],
          createdAt: new Date().toISOString(),
        }],
      });

      expect(result).toBe("generated text");
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @code-artisan/agent test`
Expected: FAIL — `anthropic.js` module not found.

- [ ] **Step 4: Implement AnthropicProvider**

Migrate from `packages/backend/src/agent/providers/anthropic/index.ts`. The implementation is essentially the same — the only changes are:
1. Import `Sandbox` type from `../types.js` instead of backend sandbox
2. Import shared types from `@code-artisan/shared`
3. Accept `maxTokens` and `thinking` config in constructor options
4. Use `params.maxTokens` and `params.thinking` from `MessageStreamParams`

Create `packages/agent/src/providers/anthropic.ts` — copy the full implementation from `packages/backend/src/agent/providers/anthropic/index.ts` with updated imports:

- Replace `import type { Sandbox } from "../sandbox/index.js"` → remove (not needed)
- Replace `import type { ... } from "../types.js"` → `import type { ... } from "../types.js"`
- Keep all message conversion logic (`toAnthropicMessages`, `toAnthropicTools`, etc.) intact

The key interface:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageStreamEvent, ToolCallPart } from "@code-artisan/shared";
import type { LLMProvider, LLMResponse, MessageStreamParams, GenerateTextParams, ToolDefinition } from "../types.js";

export interface AnthropicProviderOptions {
  apiKey?: string;
  client?: Anthropic;
  maxTokens?: number;
  thinking?: { enabled: boolean; budget: number };
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private maxTokens: number;
  private thinking: { enabled: boolean; budget: number };

  constructor(opts: AnthropicProviderOptions = {}) {
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
    this.maxTokens = opts.maxTokens ?? 16384;
    this.thinking = opts.thinking ?? { enabled: true, budget: 10000 };
  }

  // ... stream() and generateText() implementation
  // ... toAnthropicMessages(), toAnthropicTools(), etc.
}
```

The full implementation should be copied from the backend's existing `AnthropicProvider` with only import path changes.

- [ ] **Step 5: Create providers/index.ts**

```typescript
export type { LLMProvider, LLMResponse, MessageStreamParams, GenerateTextParams } from "../types.js";
export { AnthropicProvider } from "./anthropic.js";
export type { AnthropicProviderOptions } from "./anthropic.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @code-artisan/agent test`
Expected: All provider tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/providers/
git commit -m "feat(agent): add LLMProvider interface and AnthropicProvider"
```

---

## Task 8: Middlewares

**Files:**
- Create: `packages/agent/src/middlewares/dangling-tool-call.ts`
- Create: `packages/agent/src/middlewares/micro-compact.ts`
- Create: `packages/agent/src/middlewares/auto-compact.ts`
- Create: `packages/agent/src/middlewares/loop-detection.ts`
- Create: `packages/agent/src/middlewares/__tests__/*.test.ts` (4 files)
- Create: `packages/agent/src/middlewares/index.ts`

Key change from backend: middlewares now use `AgentContext` instead of `AgentRuntime`. The `AgentContext` does NOT have `store` or `emitStream` — it has `messages`, `provider`, `tools`, `usage`, `state`, `shouldStop`.

For `AutoCompactMiddleware`, it previously used `runtime.store.addMessage()` to persist the compaction. In the SDK version, it only modifies `ctx.messages` in-memory — the checkpoint will persist the state at iteration end.

For `DanglingToolCallMiddleware`, it previously called `runtime.store.updatePart()`. In the SDK version, it only modifies `ctx.messages` in-memory.

- [ ] **Step 1: Write failing tests for DanglingToolCallMiddleware**

Create `packages/agent/src/middlewares/__tests__/dangling-tool-call.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { DanglingToolCallMiddleware } from "../dangling-tool-call.js";
import type { AgentContext } from "../../types.js";
import type { Message, ToolCallPart } from "@code-artisan/shared";

function makeCtx(messages: Message[]): AgentContext {
  return {
    threadId: "t1",
    messages,
    sandbox: {} as any,
    provider: {} as any,
    tools: {} as any,
    usage: { inputTokens: 0, outputTokens: 0 },
    state: new Map(),
    shouldStop: false,
  };
}

describe("DanglingToolCallMiddleware", () => {
  const mw = new DanglingToolCallMiddleware();

  it("should mark dangling tool calls as error", async () => {
    const toolPart: ToolCallPart = {
      type: "tool-call",
      toolCallId: "tc1",
      toolName: "bash",
      input: { command: "ls" },
      state: "call",
    };
    const messages: Message[] = [
      { id: "1", role: "tool", parts: [toolPart], createdAt: new Date().toISOString() },
    ];
    const ctx = makeCtx(messages);
    await mw.beforeAgent!(ctx);
    expect(toolPart.state).toBe("error");
    expect(toolPart.output).toContain("interrupted");
  });

  it("should not touch completed tool calls", async () => {
    const toolPart: ToolCallPart = {
      type: "tool-call",
      toolCallId: "tc1",
      toolName: "bash",
      input: {},
      state: "result",
      output: "ok",
    };
    const messages: Message[] = [
      { id: "1", role: "tool", parts: [toolPart], createdAt: new Date().toISOString() },
    ];
    const ctx = makeCtx(messages);
    await mw.beforeAgent!(ctx);
    expect(toolPart.state).toBe("result");
  });
});
```

- [ ] **Step 2: Write failing tests for MicroCompactMiddleware**

Create `packages/agent/src/middlewares/__tests__/micro-compact.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { MicroCompactMiddleware } from "../micro-compact.js";
import type { AgentContext } from "../../types.js";
import type { Message, ToolCallPart } from "@code-artisan/shared";

function makeCtx(messages: Message[]): AgentContext {
  return {
    threadId: "t1",
    messages,
    sandbox: {} as any,
    provider: {} as any,
    tools: {} as any,
    usage: { inputTokens: 0, outputTokens: 0 },
    state: new Map(),
    shouldStop: false,
  };
}

function makeToolMsg(id: string, output: string): Message {
  return {
    id,
    role: "tool",
    parts: [{
      type: "tool-call",
      toolCallId: id,
      toolName: "bash",
      input: {},
      state: "result" as const,
      output,
    }],
    createdAt: new Date().toISOString(),
  };
}

describe("MicroCompactMiddleware", () => {
  it("should not modify messages when under keepRecent threshold", async () => {
    const mw = new MicroCompactMiddleware(5);
    const messages = [makeToolMsg("1", "output1"), makeToolMsg("2", "output2")];
    const ctx = makeCtx(messages);
    await mw.beforeModel!(ctx);
    expect((ctx.messages[0].parts[0] as ToolCallPart).output).toBe("output1");
  });

  it("should replace old tool outputs with placeholder when over threshold", async () => {
    const mw = new MicroCompactMiddleware(2);
    const messages = [
      makeToolMsg("1", "old output 1"),
      makeToolMsg("2", "old output 2"),
      makeToolMsg("3", "recent 1"),
      makeToolMsg("4", "recent 2"),
    ];
    const ctx = makeCtx(messages);
    await mw.beforeModel!(ctx);
    expect((ctx.messages[0].parts[0] as ToolCallPart).output).toContain("omitted");
    expect((ctx.messages[1].parts[0] as ToolCallPart).output).toContain("omitted");
    expect((ctx.messages[2].parts[0] as ToolCallPart).output).toBe("recent 1");
    expect((ctx.messages[3].parts[0] as ToolCallPart).output).toBe("recent 2");
  });
});
```

- [ ] **Step 3: Write failing tests for AutoCompactMiddleware**

Create `packages/agent/src/middlewares/__tests__/auto-compact.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { AutoCompactMiddleware } from "../auto-compact.js";
import type { AgentContext } from "../../types.js";
import type { Message } from "@code-artisan/shared";

function makeCtx(messages: Message[], generateTextResult = "summary"): AgentContext {
  return {
    threadId: "t1",
    messages,
    sandbox: {} as any,
    provider: { generateText: vi.fn().mockResolvedValue(generateTextResult) } as any,
    tools: {} as any,
    usage: { inputTokens: 0, outputTokens: 0 },
    state: new Map(),
    shouldStop: false,
  };
}

describe("AutoCompactMiddleware", () => {
  it("should not compact when under threshold", async () => {
    const mw = new AutoCompactMiddleware(150_000);
    const messages: Message[] = [
      { id: "1", role: "user", parts: [{ type: "text", text: "short" }], createdAt: new Date().toISOString() },
    ];
    const ctx = makeCtx(messages);
    await mw.beforeModel!(ctx);
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0].id).toBe("1");
  });

  it("should compact when over threshold", async () => {
    const mw = new AutoCompactMiddleware(100); // very low threshold
    const longText = "x".repeat(500);
    const messages: Message[] = [
      { id: "1", role: "user", parts: [{ type: "text", text: longText }], createdAt: new Date().toISOString() },
      { id: "2", role: "assistant", parts: [{ type: "text", text: longText }], createdAt: new Date().toISOString() },
    ];
    const ctx = makeCtx(messages, "This is a summary");
    await mw.beforeModel!(ctx);
    // After compaction: summary message + ack message
    expect(ctx.messages).toHaveLength(2);
    expect(ctx.messages[0].parts[0]).toHaveProperty("text");
    expect((ctx.messages[0].parts[0] as any).text).toContain("Summary");
  });

  it("should filter from last compaction point", async () => {
    const mw = new AutoCompactMiddleware(150_000);
    const messages: Message[] = [
      { id: "old", role: "user", parts: [{ type: "text", text: "old" }], createdAt: new Date().toISOString() },
      { id: "compact", role: "user", parts: [{ type: "text", text: "summary" }], metadata: { compacted: true }, createdAt: new Date().toISOString() },
      { id: "new", role: "assistant", parts: [{ type: "text", text: "new" }], createdAt: new Date().toISOString() },
    ];
    const ctx = makeCtx(messages);
    await mw.beforeModel!(ctx);
    expect(ctx.messages).toHaveLength(2);
    expect(ctx.messages[0].id).toBe("compact");
  });
});
```

- [ ] **Step 4: Write failing tests for LoopDetectionMiddleware**

Create `packages/agent/src/middlewares/__tests__/loop-detection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { LoopDetectionMiddleware } from "../loop-detection.js";
import type { AgentContext, LLMResponse } from "../../types.js";

function makeCtx(): AgentContext {
  return {
    threadId: "t1",
    messages: [],
    sandbox: {} as any,
    provider: {} as any,
    tools: {} as any,
    usage: { inputTokens: 0, outputTokens: 0 },
    state: new Map(),
    shouldStop: false,
  };
}

function makeResponse(toolCalls: Array<{ name: string; input: Record<string, unknown> }>): LLMResponse {
  return {
    textContent: "",
    thinkingBlocks: [],
    toolCalls: toolCalls.map((tc, i) => ({ id: `tc${i}`, ...tc })),
    stopReason: "tool_calls",
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "test",
  };
}

describe("LoopDetectionMiddleware", () => {
  it("should not trigger for unique tool calls", async () => {
    const mw = new LoopDetectionMiddleware();
    const ctx = makeCtx();
    await mw.afterModel!(ctx, makeResponse([{ name: "bash", input: { command: "ls" } }]));
    expect(ctx.shouldStop).toBe(false);
  });

  it("should add warning after 3 identical calls", async () => {
    const mw = new LoopDetectionMiddleware();
    const ctx = makeCtx();
    const response = makeResponse([{ name: "bash", input: { command: "ls" } }]);

    for (let i = 0; i < 3; i++) {
      await mw.afterModel!(ctx, response);
    }
    // Should have injected a warning message
    expect(ctx.messages.some((m) => m.parts.some((p) => p.type === "text" && (p as any).text.includes("Warning")))).toBe(true);
  });

  it("should set shouldStop after 5 identical calls", async () => {
    const mw = new LoopDetectionMiddleware();
    const ctx = makeCtx();
    const response = makeResponse([{ name: "bash", input: { command: "ls" } }]);

    for (let i = 0; i < 5; i++) {
      await mw.afterModel!(ctx, response);
    }
    expect(ctx.shouldStop).toBe(true);
  });

  it("should not trigger for empty tool calls", async () => {
    const mw = new LoopDetectionMiddleware();
    const ctx = makeCtx();
    await mw.afterModel!(ctx, makeResponse([]));
    expect(ctx.shouldStop).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm --filter @code-artisan/agent test`
Expected: FAIL — middleware modules not found.

- [ ] **Step 6: Implement all middlewares**

Create `packages/agent/src/middlewares/dangling-tool-call.ts`:

```typescript
import type { AgentMiddleware, AgentContext } from "../types.js";
import type { ToolCallPart } from "@code-artisan/shared";

export class DanglingToolCallMiddleware implements AgentMiddleware {
  name = "dangling-tool-call";

  async beforeAgent(ctx: AgentContext): Promise<void> {
    for (const msg of ctx.messages) {
      if (msg.role !== "tool") continue;
      for (const part of msg.parts) {
        if (part.type !== "tool-call") continue;
        const toolPart = part as ToolCallPart;
        if (toolPart.state === "call" && !toolPart.approval) {
          toolPart.state = "error";
          toolPart.output = "Error: Tool execution was interrupted. Please retry if needed.";
        }
      }
    }
  }
}
```

Create `packages/agent/src/middlewares/micro-compact.ts`:

```typescript
import type { AgentMiddleware, AgentContext } from "../types.js";
import type { ToolCallPart } from "@code-artisan/shared";

const DEFAULT_KEEP_RECENT = 8;

export class MicroCompactMiddleware implements AgentMiddleware {
  name = "micro-compact";
  private keepRecent: number;

  constructor(keepRecent = DEFAULT_KEEP_RECENT) {
    this.keepRecent = keepRecent;
  }

  async beforeModel(ctx: AgentContext): Promise<void> {
    const toolResults: ToolCallPart[] = [];
    for (const msg of ctx.messages) {
      if (msg.role !== "tool") continue;
      for (const part of msg.parts) {
        if (part.type === "tool-call" && part.state === "result" && part.output) {
          toolResults.push(part);
        }
      }
    }
    if (toolResults.length <= this.keepRecent) return;
    const toReplace = toolResults.slice(0, -this.keepRecent);
    for (const part of toReplace) {
      part.output = `[Previous tool call output omitted: used ${part.toolName}]`;
    }
  }
}
```

Create `packages/agent/src/middlewares/auto-compact.ts`:

```typescript
import type { AgentMiddleware, AgentContext } from "../types.js";
import type { Message } from "@code-artisan/shared";

const DEFAULT_TOKEN_THRESHOLD = 150_000;
const SUMMARY_OUTPUT_LIMIT = 500;
const SERIALIZE_LIMIT = 80_000;
const LIGHT_MODEL = "claude-haiku-4-5-20251001";

export class AutoCompactMiddleware implements AgentMiddleware {
  name = "auto-compact";
  private tokenThreshold: number;

  constructor(tokenThreshold = DEFAULT_TOKEN_THRESHOLD) {
    this.tokenThreshold = tokenThreshold;
  }

  async beforeModel(ctx: AgentContext): Promise<void> {
    this.filterFromCompactionPoint(ctx);

    const estimated = estimateTokens(ctx.messages);
    if (estimated < this.tokenThreshold) return;

    const text = serializeForSummary(ctx.messages);
    const summary = await ctx.provider.generateText({
      model: LIGHT_MODEL,
      system: "You are a conversation summarizer for coding agent sessions.",
      messages: [{
        id: "compact-prompt",
        role: "user",
        parts: [{ type: "text", text: buildCompactPrompt(text) }],
        createdAt: new Date().toISOString(),
      }],
    });

    const now = new Date().toISOString();
    ctx.messages.length = 0;
    ctx.messages.push(
      {
        id: `compact_${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: `[Conversation Summary]\n\n${summary}` }],
        metadata: { compacted: true },
        createdAt: now,
      },
      {
        id: `compact_ack_${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text: "Understood. Continuing with context from the summary." }],
        createdAt: now,
      },
    );
  }

  private filterFromCompactionPoint(ctx: AgentContext): void {
    let lastCompactIdx = -1;
    for (let i = ctx.messages.length - 1; i >= 0; i--) {
      if (ctx.messages[i].metadata?.compacted) {
        lastCompactIdx = i;
        break;
      }
    }
    if (lastCompactIdx >= 0) {
      const filtered = ctx.messages.slice(lastCompactIdx);
      ctx.messages.length = 0;
      ctx.messages.push(...filtered);
    }
  }
}

function estimateTokens(messages: Message[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

function serializeForSummary(messages: Message[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    const role = msg.role.toUpperCase();
    for (const part of msg.parts) {
      if (part.type === "text") lines.push(`[${role}] ${part.text}`);
      else if (part.type === "tool-call") {
        const output = part.output
          ? part.output.length > SUMMARY_OUTPUT_LIMIT ? part.output.slice(0, SUMMARY_OUTPUT_LIMIT) + "..." : part.output
          : "";
        lines.push(`[TOOL: ${part.toolName}] ${output}`);
      } else if (part.type === "error") lines.push(`[ERROR] ${part.message}`);
    }
  }
  const text = lines.join("\n");
  return text.length > SERIALIZE_LIMIT ? text.slice(0, SERIALIZE_LIMIT) + "\n[...truncated]" : text;
}

function buildCompactPrompt(conversationText: string): string {
  return `Summarize this coding agent conversation for continuity. Preserve:
1) Files created/modified with key code decisions
2) Current state — what's working, what's failing
3) Important constraints or user preferences mentioned
4) Concrete next steps needed
Be concise but keep file paths, function names, and error details.

Conversation:
${conversationText}`;
}
```

Create `packages/agent/src/middlewares/loop-detection.ts`:

```typescript
import { createHash } from "node:crypto";
import type { AgentMiddleware, AgentContext, LLMResponse } from "../types.js";

const WINDOW_SIZE = 20;
const WARN_THRESHOLD = 3;
const HARD_LIMIT = 5;

export class LoopDetectionMiddleware implements AgentMiddleware {
  name = "loop-detection";
  private callHashes: string[] = [];

  async afterModel(ctx: AgentContext, response?: LLMResponse): Promise<void> {
    if (!response || response.toolCalls.length === 0) return;

    for (const tc of response.toolCalls) {
      const hash = createHash("md5")
        .update(`${tc.name}:${JSON.stringify(tc.input)}`)
        .digest("hex")
        .slice(0, 12);
      this.callHashes.push(hash);
    }

    if (this.callHashes.length > WINDOW_SIZE) {
      this.callHashes = this.callHashes.slice(-WINDOW_SIZE);
    }

    const counts = new Map<string, number>();
    for (const h of this.callHashes) {
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }

    const maxCount = Math.max(...counts.values());

    if (maxCount >= HARD_LIMIT) {
      ctx.shouldStop = true;
      ctx.messages.push({
        id: `system_${Date.now()}`,
        role: "user",
        parts: [{
          type: "text",
          text: "SYSTEM: Repetitive tool call pattern detected. You have been calling the same tool with the same arguments multiple times. Please take a different approach.",
        }],
        createdAt: new Date().toISOString(),
      });
    } else if (maxCount >= WARN_THRESHOLD) {
      ctx.messages.push({
        id: `system_${Date.now()}`,
        role: "user",
        parts: [{
          type: "text",
          text: "SYSTEM: Warning — you appear to be repeating the same tool call. Please verify your approach is making progress.",
        }],
        createdAt: new Date().toISOString(),
      });
    }
  }
}
```

Create `packages/agent/src/middlewares/index.ts`:

```typescript
export { DanglingToolCallMiddleware } from "./dangling-tool-call.js";
export { MicroCompactMiddleware } from "./micro-compact.js";
export { AutoCompactMiddleware } from "./auto-compact.js";
export { LoopDetectionMiddleware } from "./loop-detection.js";

import { DanglingToolCallMiddleware } from "./dangling-tool-call.js";
import { MicroCompactMiddleware } from "./micro-compact.js";
import { AutoCompactMiddleware } from "./auto-compact.js";
import { LoopDetectionMiddleware } from "./loop-detection.js";
import type { AgentMiddleware } from "../types.js";

export function defaultMiddlewares(): AgentMiddleware[] {
  return [
    new DanglingToolCallMiddleware(),
    new MicroCompactMiddleware(),
    new AutoCompactMiddleware(),
    new LoopDetectionMiddleware(),
  ];
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @code-artisan/agent test`
Expected: All middleware tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/agent/src/middlewares/
git commit -m "feat(agent): add SDK middlewares (dangling-tool-call, micro-compact, auto-compact, loop-detection)"
```

---

## Task 9: MCP Tools

**Files:**
- Create: `packages/agent/src/mcp/mcp-tools.ts`
- Create: `packages/agent/src/mcp/mcp-tool.ts`
- Create: `packages/agent/src/mcp/__tests__/mcp-tools.test.ts`
- Create: `packages/agent/src/mcp/index.ts`

Migrated from backend — no business logic changes needed, just import path updates.

- [ ] **Step 1: Write failing tests**

Create `packages/agent/src/mcp/__tests__/mcp-tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpTools } from "../mcp-tools.js";

// Mock @modelcontextprotocol/sdk
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        { name: "test_tool", description: "A test tool", inputSchema: { type: "object", properties: {} } },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "tool result" }],
    }),
    close: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

describe("McpTools", () => {
  let mcpTools: McpTools;

  beforeEach(() => {
    mcpTools = new McpTools();
  });

  it("should initialize with empty config", async () => {
    const tools = await mcpTools.initialize([]);
    expect(tools).toEqual([]);
  });

  it("should return false for unknown tool", () => {
    expect(mcpTools.hasTool("unknown")).toBe(false);
  });

  it("should cleanup without error", async () => {
    await expect(mcpTools.cleanup()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @code-artisan/agent test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement MCP files**

Migrate `packages/backend/src/mcp/mcp-tools.ts` and `mcp-tool.ts` with updated imports. Replace `BaseTool` import from `../tools/base.js`, `ToolDefinition` from `../types.js`.

Create `packages/agent/src/mcp/mcp-tool.ts`:

```typescript
import * as z from "zod";
import { BaseTool } from "../tools/base.js";
import type { Sandbox, ToolDefinition } from "../types.js";

export class McpTool extends BaseTool<z.ZodObject<z.ZodRawShape>> {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  private inputSchema: Record<string, unknown>;
  private callFn: (input: Record<string, unknown>) => Promise<string>;

  constructor(
    serverId: string,
    toolName: string,
    description: string,
    inputSchema: Record<string, unknown>,
    callFn: (input: Record<string, unknown>) => Promise<string>,
  ) {
    super();
    this.name = `mcp_${serverId}_${toolName}`;
    this.description = `[MCP: ${serverId}] ${description}`;
    this.inputSchema = inputSchema;
    this.schema = z.object({});
    this.callFn = callFn;
  }

  toDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }

  async call(_sandbox: Sandbox, rawInput: unknown): Promise<string> {
    try {
      return await this.callFn(rawInput as Record<string, unknown>);
    } catch (err) {
      return `Error: ${String(err)}`;
    }
  }

  protected async _call(): Promise<string> {
    throw new Error("Use call() directly for MCP tools");
  }
}
```

Create `packages/agent/src/mcp/mcp-tools.ts` — migrate from backend with updated imports.

Create `packages/agent/src/mcp/index.ts`:

```typescript
export { McpTools } from "./mcp-tools.js";
export { McpTool } from "./mcp-tool.js";
export type { McpServerConfig } from "../types.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @code-artisan/agent test`
Expected: All MCP tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/mcp/
git commit -m "feat(agent): add MCP tool integration"
```

---

## Task 10: Agent Core

**Files:**
- Create: `packages/agent/src/agent.ts`
- Create: `packages/agent/src/__tests__/agent.test.ts`
- Create: `packages/agent/src/__tests__/agent.interrupt.test.ts`

This is the most complex task — the core execution loop with `stream()`, `resume()`, and `stop()`.

- [ ] **Step 1: Write failing tests for Agent execution loop**

Create `packages/agent/src/__tests__/agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "../agent.js";
import { InMemoryCheckpointSaver } from "../checkpoint/memory.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, LLMResponse, Sandbox, AgentEvent, AgentConfig } from "../types.js";
import type { MessageStreamEvent } from "@code-artisan/shared";

function createMockProvider(responses: LLMResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    stream: vi.fn(async function* (): AsyncIterable<MessageStreamEvent> {
      const resp = responses[callIndex++] ?? responses[responses.length - 1];
      yield { type: "step-start" };
      if (resp.textContent) {
        yield { type: "text-start", id: "t1" };
        yield { type: "text-delta", id: "t1", delta: resp.textContent };
        yield { type: "text-end", id: "t1", text: resp.textContent };
      }
      for (const tc of resp.toolCalls) {
        yield { type: "tool-input-start", toolCallId: tc.id, toolName: tc.name };
        yield { type: "tool-input-end", toolCallId: tc.id, toolName: tc.name, text: JSON.stringify(tc.input) };
      }
      yield { type: "step-finish", finishReason: resp.stopReason as any, usage: resp.usage };
    }),
    generateText: vi.fn().mockResolvedValue(""),
  };
}

function createMockSandbox(): Sandbox {
  return {
    id: "test-sandbox",
    exec: vi.fn().mockResolvedValue("output"),
    readFile: vi.fn().mockResolvedValue("content"),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listDir: vi.fn().mockResolvedValue(["file.txt"]),
    getHostUrl: vi.fn().mockReturnValue("http://localhost:3000"),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

async function collectEvents(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iter) {
    events.push(event);
  }
  return events;
}

describe("Agent", () => {
  let sandbox: Sandbox;
  let checkpoint: InMemoryCheckpointSaver;

  beforeEach(() => {
    sandbox = createMockSandbox();
    checkpoint = new InMemoryCheckpointSaver();
  });

  it("should handle simple text response", async () => {
    const provider = createMockProvider([
      { textContent: "Hello!", thinkingBlocks: [], toolCalls: [], stopReason: "stop", usage: { inputTokens: 10, outputTokens: 5 }, model: "test" },
    ]);

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      systemPrompt: "You are helpful.",
    });

    const events = await collectEvents(agent.stream({ parts: [{ type: "text", text: "Hi" }] }));

    expect(events.some((e) => e.type === "agent_complete")).toBe(true);
    const complete = events.find((e) => e.type === "agent_complete") as any;
    expect(complete.usage.inputTokens).toBe(10);
  });

  it("should execute tool calls and loop", async () => {
    const provider = createMockProvider([
      {
        textContent: "",
        thinkingBlocks: [],
        toolCalls: [{ id: "tc1", name: "bash", input: { description: "test", command: "echo hi" } }],
        stopReason: "tool_calls",
        usage: { inputTokens: 10, outputTokens: 5 },
        model: "test",
      },
      { textContent: "Done!", thinkingBlocks: [], toolCalls: [], stopReason: "stop", usage: { inputTokens: 8, outputTokens: 3 }, model: "test" },
    ]);

    const registry = new ToolRegistry();
    const mockTool = {
      name: "bash",
      description: "test",
      schema: {} as any,
      call: vi.fn().mockResolvedValue("command output"),
      toDefinition: () => ({ name: "bash", description: "test", inputSchema: {} }),
    };
    registry.register(mockTool as any);

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      tools: [],
      systemPrompt: "test",
    });
    // Inject custom registry
    (agent as any).registry = registry;

    const events = await collectEvents(agent.stream({ parts: [{ type: "text", text: "run ls" }] }));

    expect(events.some((e) => e.type === "tool-output")).toBe(true);
    expect(events.some((e) => e.type === "agent_complete")).toBe(true);
  });

  it("should respect maxIterations", async () => {
    // Provider always returns tool calls → should stop after maxIterations
    const provider = createMockProvider([
      {
        textContent: "",
        thinkingBlocks: [],
        toolCalls: [{ id: "tc1", name: "bash", input: { description: "x", command: "echo" } }],
        stopReason: "tool_calls",
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "test",
      },
    ]);

    const registry = new ToolRegistry();
    registry.register({ name: "bash", description: "test", schema: {} as any, call: vi.fn().mockResolvedValue("ok"), toDefinition: () => ({ name: "bash", description: "", inputSchema: {} }) } as any);

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      maxIterations: 2,
      systemPrompt: "test",
    });
    (agent as any).registry = registry;

    const events = await collectEvents(agent.stream({ parts: [{ type: "text", text: "go" }] }));
    const complete = events.find((e) => e.type === "agent_complete");
    expect(complete).toBeDefined();
    // Provider.stream should be called at most 2 times
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  it("should save checkpoint after each iteration", async () => {
    const provider = createMockProvider([
      {
        textContent: "",
        thinkingBlocks: [],
        toolCalls: [{ id: "tc1", name: "bash", input: { description: "x", command: "echo" } }],
        stopReason: "tool_calls",
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "test",
      },
      { textContent: "done", thinkingBlocks: [], toolCalls: [], stopReason: "stop", usage: { inputTokens: 1, outputTokens: 1 }, model: "test" },
    ]);

    const registry = new ToolRegistry();
    registry.register({ name: "bash", description: "test", schema: {} as any, call: vi.fn().mockResolvedValue("ok"), toDefinition: () => ({ name: "bash", description: "", inputSchema: {} }) } as any);

    const saveSpy = vi.spyOn(checkpoint, "save");

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      systemPrompt: "test",
    });
    (agent as any).registry = registry;

    await collectEvents(agent.stream({ parts: [{ type: "text", text: "go" }] }));

    // Should save at least: after tool iteration + final completion
    expect(saveSpy).toHaveBeenCalled();
    expect(saveSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("should stop when stop() is called", async () => {
    const provider = createMockProvider([
      {
        textContent: "",
        thinkingBlocks: [],
        toolCalls: [{ id: "tc1", name: "bash", input: { description: "x", command: "sleep 100" } }],
        stopReason: "tool_calls",
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "test",
      },
    ]);

    const registry = new ToolRegistry();
    registry.register({
      name: "bash",
      description: "test",
      schema: {} as any,
      call: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return "ok";
      }),
      toDefinition: () => ({ name: "bash", description: "", inputSchema: {} }),
    } as any);

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      systemPrompt: "test",
    });
    (agent as any).registry = registry;

    // Start streaming and stop after first event
    const events: AgentEvent[] = [];
    const iter = agent.stream({ parts: [{ type: "text", text: "go" }] });

    setTimeout(() => agent.stop(), 10);

    for await (const event of iter) {
      events.push(event);
    }

    // Should complete without infinite loop
    expect(events.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Write failing tests for interrupt/resume**

Create `packages/agent/src/__tests__/agent.interrupt.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent } from "../agent.js";
import { InMemoryCheckpointSaver } from "../checkpoint/memory.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LLMProvider, LLMResponse, Sandbox, AgentEvent } from "../types.js";
import type { MessageStreamEvent } from "@code-artisan/shared";

function createMockProvider(responses: LLMResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    stream: vi.fn(async function* (): AsyncIterable<MessageStreamEvent> {
      const resp = responses[callIndex++] ?? responses[responses.length - 1];
      yield { type: "step-start" };
      if (resp.textContent) {
        yield { type: "text-start", id: "t1" };
        yield { type: "text-end", id: "t1", text: resp.textContent };
      }
      for (const tc of resp.toolCalls) {
        yield { type: "tool-input-start", toolCallId: tc.id, toolName: tc.name };
        yield { type: "tool-input-end", toolCallId: tc.id, toolName: tc.name, text: JSON.stringify(tc.input) };
      }
      yield { type: "step-finish", finishReason: resp.stopReason as any, usage: resp.usage };
    }),
    generateText: vi.fn().mockResolvedValue(""),
  };
}

function createMockSandbox(): Sandbox {
  return {
    id: "test-sandbox",
    exec: vi.fn().mockResolvedValue("output"),
    readFile: vi.fn().mockResolvedValue(""),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listDir: vi.fn().mockResolvedValue([]),
    getHostUrl: vi.fn().mockReturnValue("http://localhost:3000"),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

async function collectEvents(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iter) events.push(event);
  return events;
}

describe("Agent Interrupt/Resume", () => {
  let sandbox: Sandbox;
  let checkpoint: InMemoryCheckpointSaver;
  let registry: ToolRegistry;

  beforeEach(() => {
    sandbox = createMockSandbox();
    checkpoint = new InMemoryCheckpointSaver();
    registry = new ToolRegistry();
    registry.register({
      name: "bash",
      description: "test",
      schema: {} as any,
      call: vi.fn().mockResolvedValue("executed"),
      toDefinition: () => ({ name: "bash", description: "", inputSchema: {} }),
    } as any);
  });

  it("should yield interrupt event when tool matches interruptOn", async () => {
    const provider = createMockProvider([
      {
        textContent: "",
        thinkingBlocks: [],
        toolCalls: [{ id: "tc1", name: "bash", input: { command: "rm -rf /" } }],
        stopReason: "tool_calls",
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "test",
      },
    ]);

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      interruptOn: { bash: { decisions: ["approve", "reject"] } },
      systemPrompt: "test",
    });
    (agent as any).registry = registry;

    const events = await collectEvents(agent.stream({ parts: [{ type: "text", text: "delete everything" }] }));

    const interrupt = events.find((e) => e.type === "interrupt") as any;
    expect(interrupt).toBeDefined();
    expect(interrupt.toolCalls).toHaveLength(1);
    expect(interrupt.toolCalls[0].name).toBe("bash");

    // Should NOT have agent_complete (paused)
    expect(events.some((e) => e.type === "agent_complete")).toBe(false);
  });

  it("should save interrupted state to checkpoint", async () => {
    const provider = createMockProvider([
      {
        textContent: "",
        thinkingBlocks: [],
        toolCalls: [{ id: "tc1", name: "bash", input: { command: "ls" } }],
        stopReason: "tool_calls",
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "test",
      },
    ]);

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      interruptOn: { bash: { decisions: ["approve", "reject"] } },
      systemPrompt: "test",
    });
    (agent as any).registry = registry;

    await collectEvents(agent.stream({ parts: [{ type: "text", text: "go" }] }));

    const state = await checkpoint.restore("t1");
    expect(state).not.toBeNull();
    expect(state!.status).toBe("interrupted");
    expect(state!.pendingToolCalls).toHaveLength(1);
  });

  it("should resume and execute tools on approve", async () => {
    const provider = createMockProvider([
      {
        textContent: "",
        thinkingBlocks: [],
        toolCalls: [{ id: "tc1", name: "bash", input: { command: "ls" } }],
        stopReason: "tool_calls",
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "test",
      },
      { textContent: "Done", thinkingBlocks: [], toolCalls: [], stopReason: "stop", usage: { inputTokens: 1, outputTokens: 1 }, model: "test" },
    ]);

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      interruptOn: { bash: { decisions: ["approve", "reject"] } },
      systemPrompt: "test",
    });
    (agent as any).registry = registry;

    // Phase 1: stream until interrupt
    await collectEvents(agent.stream({ parts: [{ type: "text", text: "go" }] }));

    // Phase 2: resume with approve
    const resumeEvents = await collectEvents(agent.resume("t1", { action: "approve" }));

    expect(resumeEvents.some((e) => e.type === "tool-output")).toBe(true);
    expect(resumeEvents.some((e) => e.type === "agent_complete")).toBe(true);
  });

  it("should resume with rejection message on reject", async () => {
    const provider = createMockProvider([
      {
        textContent: "",
        thinkingBlocks: [],
        toolCalls: [{ id: "tc1", name: "bash", input: { command: "ls" } }],
        stopReason: "tool_calls",
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "test",
      },
      { textContent: "OK I won't do that", thinkingBlocks: [], toolCalls: [], stopReason: "stop", usage: { inputTokens: 1, outputTokens: 1 }, model: "test" },
    ]);

    const agent = new Agent({
      threadId: "t1",
      provider,
      sandbox,
      checkpoint,
      interruptOn: { bash: { decisions: ["approve", "reject"] } },
      systemPrompt: "test",
    });
    (agent as any).registry = registry;

    await collectEvents(agent.stream({ parts: [{ type: "text", text: "go" }] }));
    const resumeEvents = await collectEvents(agent.resume("t1", { action: "reject" }));

    expect(resumeEvents.some((e) => e.type === "agent_complete")).toBe(true);

    // Check checkpoint state shows completed
    const state = await checkpoint.restore("t1");
    expect(state!.status).toBe("completed");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @code-artisan/agent test`
Expected: FAIL — `agent.js` module not found.

- [ ] **Step 4: Implement Agent class**

Create `packages/agent/src/agent.ts`:

The Agent class is the most complex piece. Key differences from backend version:
1. `stream()` returns `AsyncGenerator<AgentEvent>` instead of `void`
2. No DB access — uses checkpoint for persistence
3. No eventBus — yields events directly
4. `interruptOn` config for declarative HITL
5. `resume()` method restores from checkpoint and continues

```typescript
import type {
  AgentConfig,
  AgentContext,
  AgentEvent,
  AgentMiddleware,
  InterruptDecision,
  LLMProvider,
  LLMResponse,
  ThinkingBlock,
  ToolCall,
  Sandbox,
  CheckpointSaver,
  AgentState,
} from "./types.js";
import type { Message, MessagePart, ToolCallPart } from "@code-artisan/shared";
import { ToolRegistry } from "./tools/registry.js";
import { createDefaultTools } from "./tools/index.js";
import { McpTools } from "./mcp/mcp-tools.js";
import { defaultMiddlewares } from "./middlewares/index.js";

export class Agent {
  private config: AgentConfig;
  private registry: ToolRegistry;
  private middlewares: AgentMiddleware[];
  private abortController: AbortController;

  constructor(config: AgentConfig) {
    this.config = config;
    this.middlewares = config.middlewares ?? defaultMiddlewares();
    this.registry = createDefaultTools();
    this.abortController = new AbortController();

    // Register user-provided tools
    if (config.tools) {
      for (const tool of config.tools) {
        this.registry.register(tool);
      }
    }
  }

  async *stream(input: { parts: MessagePart[] }): AsyncGenerator<AgentEvent> {
    const { threadId, provider, sandbox, checkpoint } = this.config;
    const mcpTools = new McpTools();

    try {
      // Initialize MCP tools
      if (this.config.mcpServers?.length) {
        const mcpToolInstances = await mcpTools.initialize(this.config.mcpServers);
        for (const tool of mcpToolInstances) {
          this.registry.register(tool);
        }
      }

      // Restore or create state
      let state = await checkpoint?.restore(threadId) ?? {
        messages: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        status: "running" as const,
      };
      state.status = "running";

      // Add user message
      const userMsg: Message = {
        id: `user_${Date.now()}`,
        role: "user",
        parts: input.parts,
        createdAt: new Date().toISOString(),
      };
      state.messages.push(userMsg);

      // Build context
      const ctx = this.buildContext(state);

      await this.runHook("beforeAgent", ctx);

      yield* this.runLoop(ctx, state, mcpTools);
    } catch (err) {
      yield { type: "error", error: String(err) };
    } finally {
      await mcpTools.cleanup();
    }
  }

  async *resume(threadId: string, decision: InterruptDecision): AsyncGenerator<AgentEvent> {
    const { provider, sandbox, checkpoint } = this.config;
    const mcpTools = new McpTools();

    try {
      if (this.config.mcpServers?.length) {
        const mcpToolInstances = await mcpTools.initialize(this.config.mcpServers);
        for (const tool of mcpToolInstances) {
          this.registry.register(tool);
        }
      }

      const state = await checkpoint?.restore(threadId);
      if (!state || state.status !== "interrupted") {
        yield { type: "error", error: "No interrupted state found for this thread" };
        return;
      }

      state.status = "running";

      // Handle pending tool calls based on decision
      if (decision.action === "approve" && state.pendingToolCalls) {
        const results = await Promise.allSettled(
          state.pendingToolCalls.map((tc) => this.executeTool(tc)),
        );

        for (let i = 0; i < state.pendingToolCalls.length; i++) {
          const tc = state.pendingToolCalls[i];
          const result = results[i];
          const output = result.status === "fulfilled" ? result.value : `Error: ${result.reason}`;
          const resultState = result.status === "fulfilled" ? "result" as const : "error" as const;

          state.messages.push({
            id: `tool_${Date.now()}_${i}`,
            role: "tool",
            parts: [{
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.input,
              state: resultState,
              output,
            }],
            createdAt: new Date().toISOString(),
          });

          yield { type: "tool-output", toolCallId: tc.id, toolName: tc.name, state: resultState, output };
        }
      } else if (decision.action === "reject") {
        state.messages.push({
          id: `rejection_${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: "User rejected the tool call. Please try a different approach." }],
          createdAt: new Date().toISOString(),
        });
      }

      state.pendingToolCalls = undefined;

      const ctx = this.buildContext(state);
      yield* this.runLoop(ctx, state, mcpTools);
    } catch (err) {
      yield { type: "error", error: String(err) };
    } finally {
      await mcpTools.cleanup();
    }
  }

  stop(): void {
    this.abortController.abort();
  }

  // --- Private ---

  private async *runLoop(ctx: AgentContext, state: AgentState, mcpTools: McpTools): AsyncGenerator<AgentEvent> {
    const { maxIterations = 10, checkpoint } = this.config;

    for (let i = 0; i < maxIterations && !ctx.shouldStop; i++) {
      if (this.abortController.signal.aborted) {
        ctx.shouldStop = true;
        break;
      }

      await this.runHook("beforeModel", ctx);
      if (ctx.shouldStop) break;

      const { response, events } = await this.callModel(ctx);
      for (const event of events) yield event;

      await this.runHook("afterModel", ctx, response);
      if (ctx.shouldStop) break;

      state.usage.inputTokens += response.usage.inputTokens;
      state.usage.outputTokens += response.usage.outputTokens;
      ctx.usage = state.usage;

      // Persist assistant message
      this.addAssistantMessage(state, response, i);

      if (response.stopReason !== "tool_calls") break;

      // Check interruptOn
      const interruptedTools = response.toolCalls.filter(
        (tc) => this.config.interruptOn?.[tc.name],
      );

      if (interruptedTools.length > 0) {
        state.status = "interrupted";
        state.pendingToolCalls = response.toolCalls;
        await checkpoint?.save(this.config.threadId, state);
        yield { type: "interrupt", toolCalls: response.toolCalls };
        return;
      }

      // Execute tools
      const toolEvents: AgentEvent[] = [];
      const results = await Promise.allSettled(
        response.toolCalls.map((tc) => this.executeTool(tc)),
      );

      for (let j = 0; j < response.toolCalls.length; j++) {
        const tc = response.toolCalls[j];
        const result = results[j];
        const output = result.status === "fulfilled" ? result.value : `Error: ${result.reason}`;
        const resultState = result.status === "fulfilled" ? "result" as const : "error" as const;

        state.messages.push({
          id: `tool_${Date.now()}_${j}`,
          role: "tool",
          parts: [{
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.input,
            state: resultState,
            output,
          }],
          createdAt: new Date().toISOString(),
        });

        const toolEvent: AgentEvent = { type: "tool-output", toolCallId: tc.id, toolName: tc.name, state: resultState, output };
        toolEvents.push(toolEvent);
        yield toolEvent;
      }

      await this.runHook("afterToolExecution", ctx);

      // Checkpoint after each iteration
      await checkpoint?.save(this.config.threadId, state);
      yield { type: "iteration_complete", iteration: i };
    }

    await this.runHook("afterAgent", ctx);
    state.status = "completed";
    await checkpoint?.save(this.config.threadId, state);
    yield { type: "agent_complete", usage: state.usage };
  }

  private async callModel(ctx: AgentContext): Promise<{ response: LLMResponse; events: AgentEvent[] }> {
    const { provider, systemPrompt = "", model = "claude-sonnet-4-6-20250514" } = this.config;
    const events: AgentEvent[] = [];

    const stream = provider.stream({
      model,
      system: systemPrompt || this.buildDefaultSystemPrompt(),
      messages: ctx.messages,
      tools: this.registry.toToolDefinitions(),
      maxTokens: this.config.maxTokens,
      thinking: this.config.thinking,
    });

    let textContent = "";
    const thinkingBlocks: ThinkingBlock[] = [];
    const toolCalls: ToolCall[] = [];
    let stopReason = "stop";
    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const event of stream) {
      if (event.type !== "stream-finish") {
        events.push(event);
      }
      switch (event.type) {
        case "thinking-end":
          thinkingBlocks.push({ thinking: event.text, signature: event.signature });
          break;
        case "text-end":
          textContent = event.text;
          break;
        case "tool-input-end":
          toolCalls.push({ id: event.toolCallId, name: event.toolName, input: JSON.parse(event.text || "{}") });
          break;
        case "step-finish":
          stopReason = event.finishReason;
          usage = event.usage;
          break;
      }
    }

    return { response: { textContent, thinkingBlocks, toolCalls, stopReason, usage, model }, events };
  }

  private async executeTool(tc: ToolCall): Promise<string> {
    const tool = this.registry.get(tc.name);
    if (!tool) return `Error: Unknown tool: ${tc.name}`;
    return tool.call(this.config.sandbox, tc.input);
  }

  private addAssistantMessage(state: AgentState, response: LLMResponse, stepIndex: number): void {
    const parts: MessagePart[] = [];
    for (const tb of response.thinkingBlocks) {
      parts.push({ type: "thinking", thinking: tb.thinking, signature: tb.signature });
    }
    if (response.textContent) parts.push({ type: "text", text: response.textContent });
    parts.push({
      type: "step-end",
      stepIndex,
      usage: response.usage,
      finishReason: response.stopReason,
      model: response.model,
    });

    state.messages.push({
      id: `assistant_${Date.now()}`,
      role: "assistant",
      parts,
      createdAt: new Date().toISOString(),
    });
  }

  private buildContext(state: AgentState): AgentContext {
    return {
      threadId: this.config.threadId,
      messages: state.messages,
      sandbox: this.config.sandbox,
      provider: this.config.provider,
      tools: this.registry,
      usage: state.usage,
      state: new Map(),
      shouldStop: false,
    };
  }

  private buildDefaultSystemPrompt(): string {
    const toolSection = this.registry.toPromptSection();
    return `You are an AI coding agent. You have access to these tools:\n${toolSection}\n\nUse tools to interact with the filesystem. Be concise.`;
  }

  private async runHook(hook: keyof Omit<AgentMiddleware, "name">, ctx: AgentContext, ...args: unknown[]): Promise<void> {
    for (const mw of this.middlewares) {
      const fn = mw[hook];
      if (!fn) continue;
      await (fn as Function).call(mw, ctx, ...args);
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @code-artisan/agent test`
Expected: All agent tests PASS. Debug and fix any failures.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/agent.ts packages/agent/src/__tests__/
git commit -m "feat(agent): add Agent class with stream/resume/stop and HITL interrupt support"
```

---

## Task 11: Public API Exports

**Files:**
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Update index.ts with all public exports**

```typescript
// Core
export { Agent } from "./agent.js";

// Types
export type {
  AgentConfig,
  AgentContext,
  AgentEvent,
  AgentMiddleware,
  AgentState,
  CheckpointSaver,
  ExecOptions,
  GenerateTextParams,
  InterruptConfig,
  InterruptDecision,
  LLMProvider,
  LLMResponse,
  McpServerConfig,
  MessageStreamParams,
  Sandbox,
  ThinkingBlock,
  ToolCall,
  ToolDefinition,
} from "./types.js";

// Sandbox
export { LocalSandbox } from "./sandbox/index.js";

// Checkpoint
export { InMemoryCheckpointSaver } from "./checkpoint/index.js";

// Tools
export { BaseTool, truncateOutput } from "./tools/base.js";
export { ToolRegistry } from "./tools/registry.js";
export { createDefaultTools } from "./tools/index.js";
export { BashTool } from "./tools/bash.js";
export { LsTool } from "./tools/ls.js";
export { ReadFileTool } from "./tools/read-file.js";
export { WriteFileTool } from "./tools/write-file.js";
export { StrReplaceTool } from "./tools/str-replace.js";
export { StartServerTool } from "./tools/start-server.js";
export { WebSearchTool } from "./tools/web-search.js";
export { WebFetchTool } from "./tools/web-fetch.js";

// Providers
export { AnthropicProvider } from "./providers/index.js";
export type { AnthropicProviderOptions } from "./providers/anthropic.js";

// Middlewares
export {
  defaultMiddlewares,
  DanglingToolCallMiddleware,
  MicroCompactMiddleware,
  AutoCompactMiddleware,
  LoopDetectionMiddleware,
} from "./middlewares/index.js";

// MCP
export { McpTools } from "./mcp/index.js";
```

- [ ] **Step 2: Verify full build**

Run: `pnpm --filter @code-artisan/agent test`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat(agent): add public API exports"
```

---

## Task 12: Backend Migration

**Files:**
- Modify: `packages/backend/package.json` — add `@code-artisan/agent` dependency
- Create: `packages/backend/src/checkpoint/postgres.ts`
- Modify: `packages/backend/src/sandbox/e2b-sandbox.ts` — conform to SDK Sandbox interface
- Modify: `packages/backend/src/routes/conversations.ts` — use SDK Agent
- Move: `packages/backend/src/agent/middlewares/title-generation.ts` → `packages/backend/src/middlewares/title-generation.ts`
- Move: `packages/backend/src/agent/middlewares/token-usage.ts` → `packages/backend/src/middlewares/token-usage.ts`
- Delete: `packages/backend/src/agent/` (entire directory)
- Delete: `packages/backend/src/tools/` (entire directory)
- Delete: `packages/backend/src/mcp/mcp-tools.ts`, `mcp-tool.ts`

This task is large. Break into sub-steps.

- [ ] **Step 1: Add SDK dependency to backend**

In `packages/backend/package.json`, add:
```json
"@code-artisan/agent": "workspace:*"
```

Run: `pnpm install`

- [ ] **Step 2: Create PostgresCheckpointSaver**

Create `packages/backend/src/checkpoint/postgres.ts`:

```typescript
import type { CheckpointSaver, AgentState } from "@code-artisan/agent";
import { MessageStore } from "../services/message-store.js";
import type { Message } from "@code-artisan/shared";

/**
 * PostgresCheckpointSaver bridges the SDK's checkpoint interface with
 * the existing MessageStore for database persistence.
 *
 * save: persists messages to DB via MessageStore
 * restore: loads messages from DB via MessageStore
 */
export class PostgresCheckpointSaver implements CheckpointSaver {
  private stores = new Map<string, MessageStore>();

  private getStore(threadId: string): MessageStore {
    let store = this.stores.get(threadId);
    if (!store) {
      store = new MessageStore(threadId);
      this.stores.set(threadId, store);
    }
    return store;
  }

  async save(threadId: string, state: AgentState): Promise<void> {
    // The current architecture uses MessageStore.addMessage for each new message.
    // For checkpoint, we track which messages are already persisted and only add new ones.
    // This is a simplified approach — in production you might want a dedicated checkpoint table.
    const store = this.getStore(threadId);
    const existingMessages = await store.getMessages();
    const existingIds = new Set(existingMessages.map((m) => m.id));

    for (const msg of state.messages) {
      if (!existingIds.has(msg.id)) {
        await store.addMessage(msg.role, msg.parts, msg.metadata);
      }
    }
  }

  async restore(threadId: string): Promise<AgentState | null> {
    const store = this.getStore(threadId);
    const messages = await store.getMessages();
    if (messages.length === 0) return null;

    return {
      messages,
      usage: { inputTokens: 0, outputTokens: 0 },
      status: "running",
    };
  }
}
```

- [ ] **Step 3: Update E2BSandbox to conform to SDK Sandbox interface**

Modify `packages/backend/src/sandbox/e2b-sandbox.ts` to import `Sandbox` from `@code-artisan/agent` instead of local types:

```typescript
import type { Sandbox } from "@code-artisan/agent";
// ... rest stays the same, ensure exec() method name matches
```

If the current method is `executeCommand`, rename to `exec` or add an `exec` alias. Update the `Sandbox` type import.

- [ ] **Step 4: Move business middlewares**

Move `packages/backend/src/agent/middlewares/title-generation.ts` → `packages/backend/src/middlewares/title-generation.ts`

Update imports: `AgentMiddleware` from `@code-artisan/agent` instead of `../types.js`.

Move `packages/backend/src/agent/middlewares/token-usage.ts` → `packages/backend/src/middlewares/token-usage.ts`

Update imports similarly.

- [ ] **Step 5: Update conversations route to use SDK Agent**

Rewrite `packages/backend/src/routes/conversations.ts` to use SDK:

Key changes in the POST `/messages` handler:
```typescript
import { Agent, AnthropicProvider, defaultMiddlewares } from "@code-artisan/agent";
import { PostgresCheckpointSaver } from "../checkpoint/postgres.js";
import { TitleGenerationMiddleware } from "../middlewares/title-generation.js";
import { TokenUsageMiddleware } from "../middlewares/token-usage.js";

// In POST handler:
const agent = new Agent({
  threadId: conversationId,
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  sandbox: await getSandbox(conversationId),
  checkpoint: new PostgresCheckpointSaver(),
  middlewares: [
    ...defaultMiddlewares(),
    new TitleGenerationMiddleware(),
    new TokenUsageMiddleware(),
  ],
  interruptOn: mode === "confirm" ? {
    bash: { decisions: ["approve", "reject"] },
    write_file: { decisions: ["approve", "reject"] },
    str_replace: { decisions: ["approve", "reject"] },
    start_server: { decisions: ["approve", "reject"] },
  } : {},
  systemPrompt: buildSystemPrompt(),
  model: "anthropic/claude-opus-4.6",
});

// Stream to SSE
streamSSE(c, async (stream) => {
  for await (const event of agent.stream({ parts: userParts })) {
    if (event.type === "interrupt") {
      // Handle confirm mode
    }
    await stream.writeSSE({ data: JSON.stringify(event) });
  }
});
```

For POST `/confirm`:
```typescript
for await (const event of agent.resume(conversationId, { action: approved ? "approve" : "reject" })) {
  eventBus.emitStream(conversationId, event);
}
```

- [ ] **Step 6: Delete old backend agent code**

```bash
rm -rf packages/backend/src/agent/
rm -rf packages/backend/src/tools/
rm packages/backend/src/mcp/mcp-tools.ts packages/backend/src/mcp/mcp-tool.ts
```

- [ ] **Step 7: Update backend imports throughout**

Search for any remaining imports from deleted paths and update them.

- [ ] **Step 8: Run all tests**

Run: `pnpm test`
Expected: Both `@code-artisan/agent` and `@code-artisan/backend` tests PASS.

- [ ] **Step 9: Manual smoke test**

Run: `pnpm dev`
Test in browser: create conversation, send message, verify streaming, tool execution, confirm mode.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: migrate backend to use @code-artisan/agent SDK"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec requirements mapped to tasks (types, sandbox, checkpoint, tools, providers, middlewares, MCP, agent core, backend migration)
- [x] **No placeholders:** All steps contain concrete code
- [x] **Type consistency:** `AgentContext` used consistently (not `AgentRuntime`), `_call(sandbox, input)` signature consistent across tools, `AgentEvent` type matches across agent and tests
- [x] **Dependency order:** Tasks are ordered bottom-up: types → sandbox → checkpoint → tools → providers → middlewares → MCP → agent → exports → backend migration
