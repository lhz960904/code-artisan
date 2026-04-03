# MCP Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MCP server marketplace + client integration so the agent can use tools from installed MCP servers alongside builtins.

**Architecture:** Self-maintained static registry JSON → user installs via UI → DB stores config → agent run spawns MCP servers via `@modelcontextprotocol/sdk` stdio → MCP tools registered into per-run ToolRegistry → agent uses them like builtins.

**Tech Stack:** `@modelcontextprotocol/sdk`, Drizzle ORM, Hono, React + TanStack Router/Query + shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-03-mcp-support-design.md`

---

### Task 1: Shared types for MCP

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add MCP types to shared package**

Append to the end of `packages/shared/src/types.ts` (before any closing comments):

```typescript
// ============================================================
// MCP Types
// ============================================================

export interface McpEnvVar {
  name: string;
  label: string;
  placeholder: string;
  description: string;
  required: boolean;
}

export interface McpRegistryServer {
  id: string;
  name: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  command: string;
  args: string[];
  envVars: McpEnvVar[];
  docUrl: string;
  featured: boolean;
}

export interface McpInstalledServer {
  id: string;
  serverId: string;
  envVars: Record<string, string>;
  installedAt: string;
  name: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  docUrl: string;
}

export interface McpServerListItem extends McpRegistryServer {
  installed: boolean;
  installedId?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add shared MCP types (registry, installed, list item)"
```

---

### Task 2: Database schema + migration

**Files:**
- Modify: `packages/backend/src/db/schema.ts`

- [ ] **Step 1: Add mcp_servers table to schema**

Add to `packages/backend/src/db/schema.ts` after the `userQuotas` table:

```typescript
export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    serverId: text("server_id").notNull(),
    envVars: jsonb("env_vars").notNull().default({}),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.serverId)],
);
```

- [ ] **Step 2: Generate and run migration**

```bash
cd packages/backend
npx drizzle-kit generate
npx drizzle-kit push
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/
git commit -m "feat: add mcp_servers database table"
```

---

### Task 3: Static MCP registry JSON

**Files:**
- Create: `packages/backend/src/mcp/mcp-registry.json`

- [ ] **Step 1: Create the registry file**

Create `packages/backend/src/mcp/mcp-registry.json`:

```json
{
  "servers": [
    {
      "id": "context7",
      "name": "Context7",
      "author": "upstash",
      "description": "Up-to-date code documentation for LLMs. Provides version-specific documentation and code examples straight from the source, eliminating outdated or hallucinated API references.",
      "category": "documentation",
      "tags": ["documentation", "code-examples", "library-docs", "api-reference", "up-to-date"],
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "envVars": [],
      "docUrl": "https://github.com/upstash/context7",
      "featured": true
    },
    {
      "id": "sequential-thinking",
      "name": "Sequential Thinking",
      "author": "modelcontextprotocol",
      "description": "An MCP server that provides a tool for dynamic, reflective problem-solving through a structured thinking process with branching and revision capabilities.",
      "category": "thinking",
      "tags": ["thinking", "reasoning", "problem-solving", "chain-of-thought"],
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "envVars": [],
      "docUrl": "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
      "featured": true
    },
    {
      "id": "brave-search",
      "name": "Brave Search",
      "author": "modelcontextprotocol",
      "description": "Web and local search using Brave's Search API. Provides both web search and local business/place search capabilities.",
      "category": "search",
      "tags": ["search", "web-search", "brave", "local-search"],
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "envVars": [
        {
          "name": "BRAVE_API_KEY",
          "label": "Brave API Key",
          "placeholder": "BSA-xxxxxxxxxxxxxxxx",
          "description": "Your Brave Search API key from https://brave.com/search/api/",
          "required": true
        }
      ],
      "docUrl": "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
      "featured": false
    },
    {
      "id": "firecrawl",
      "name": "Firecrawl",
      "author": "mendableai",
      "description": "Advanced web scraping, crawling, and batch processing. Extract clean content from any website with automatic format conversion.",
      "category": "web-scraping",
      "tags": ["web-scraping", "crawling", "content-extraction", "batch-processing"],
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "envVars": [
        {
          "name": "FIRECRAWL_API_KEY",
          "label": "Firecrawl API Key",
          "placeholder": "fc-xxxxxxxxxxxxxxxx",
          "description": "Your Firecrawl API key from https://www.firecrawl.dev/app/api-keys",
          "required": true
        }
      ],
      "docUrl": "https://github.com/mendableai/firecrawl-mcp",
      "featured": true
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/mcp/mcp-registry.json
git commit -m "feat: add static MCP server registry with 4 curated servers"
```

---

### Task 4: ToolRegistry refactor — singleton to factory

**Files:**
- Modify: `packages/backend/src/tools/index.ts`
- Modify: `packages/backend/src/agent/agent.ts`
- Modify: `packages/backend/src/tools/__tests__/registry.test.ts`

This task changes `toolRegistry` from a global singleton to a `createToolRegistry()` factory function. The Agent class receives a registry instance and passes it through its methods.

- [ ] **Step 1: Read current registry test**

Read `packages/backend/src/tools/__tests__/registry.test.ts` to understand existing tests.

- [ ] **Step 2: Update tools/index.ts — export factory instead of singleton**

Replace the full content of `packages/backend/src/tools/index.ts`:

```typescript
export { BaseTool, type ToolRuntime } from "./base.js";
export { ToolRegistry } from "./registry.js";

import { ToolRegistry } from "./registry.js";
import { BashTool } from "./builtins/bash.js";
import { LsTool } from "./builtins/ls.js";
import { ReadFileTool } from "./builtins/read-file.js";
import { WriteFileTool } from "./builtins/write-file.js";
import { StrReplaceTool } from "./builtins/str-replace.js";
import { StartServerTool } from "./builtins/start-server.js";
import { WebSearchTool } from "./builtins/web-search.js";
import { WebFetchTool } from "./builtins/web-fetch.js";
import { env } from "../env.js";

/** Create a new ToolRegistry with all builtin tools registered. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new BashTool());
  registry.register(new LsTool());
  registry.register(new ReadFileTool());
  registry.register(new WriteFileTool());
  registry.register(new StrReplaceTool());
  registry.register(new StartServerTool());

  if (env.TAVILY_API_KEY) {
    registry.register(new WebSearchTool(env.TAVILY_API_KEY));
    registry.register(new WebFetchTool(env.TAVILY_API_KEY));
  }

  return registry;
}
```

- [ ] **Step 3: Update agent.ts — use injected registry**

In `packages/backend/src/agent/agent.ts`, make the following changes:

**a)** Replace the `toolRegistry` import:

```typescript
// Remove this line:
import { toolRegistry } from "../tools/index.js";

// Add this line:
import { createToolRegistry, type ToolRegistry } from "../tools/index.js";
```

**b)** Change `buildSystemPrompt()` to accept a registry parameter:

```typescript
function buildSystemPrompt(registry: ToolRegistry): string {
  const toolSection = registry.toPromptSection();
  return `You are an AI coding agent running in a sandboxed Linux environment. You help users write code, execute commands, and build projects.

You have access to these tools:
${toolSection}

Always use tools to interact with the filesystem. When the user asks you to write code, use write_file to create the file, then bash to run it. For web servers, use start_server to launch them and provide the preview URL. Use str_replace to make targeted edits to existing files instead of rewriting the entire file. Be concise in your text responses.`;
}
```

**c)** Add `registry` field to the Agent class and update constructor:

```typescript
export class Agent {
  private provider: LLMProvider;
  private middlewares: AgentMiddleware[];
  private registry: ToolRegistry;

  constructor(provider: LLMProvider, middlewares: AgentMiddleware[] = []) {
    this.provider = provider;
    this.middlewares = middlewares;
    this.registry = createToolRegistry();
  }
```

**d)** Update `callModel()` to use `this.registry`:

```typescript
private async callModel(runtime: AgentRuntime): Promise<LLMResponse> {
    const model = "anthropic/claude-opus-4.6";
    const stream = this.provider.stream({
      model,
      system: buildSystemPrompt(this.registry),
      messages: runtime.messages,
      tools: this.registry.toToolDefinitions(),
    });
    // ... rest stays the same
```

**e)** Update `executeTool()` to use `this.registry`:

```typescript
private async executeTool(runtime: AgentRuntime, tc: ToolCall): Promise<string> {
    const tool = this.registry.get(tc.name);
    if (!tool) return `Error: Unknown tool: ${tc.name}`;
    return tool.call({ sandbox: runtime.sandbox, conversationId: runtime.conversationId }, tc.input);
  }
```

- [ ] **Step 4: Export ToolRegistry class from registry.ts**

In `packages/backend/src/tools/registry.ts`, add `export` to the class declaration if it's not already exported:

```typescript
export class ToolRegistry {
```

- [ ] **Step 5: Update registry tests**

Update `packages/backend/src/tools/__tests__/registry.test.ts` to use the new factory pattern. Read the file first, then update imports to use `createToolRegistry` or instantiate `ToolRegistry` directly.

- [ ] **Step 6: Run full test suite**

```bash
cd packages/backend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/tools/index.ts packages/backend/src/tools/registry.ts packages/backend/src/agent/agent.ts packages/backend/src/tools/__tests__/registry.test.ts
git commit -m "refactor: change ToolRegistry from singleton to factory function"
```

---

### Task 5: McpTool class

**Files:**
- Create: `packages/backend/src/mcp/mcp-tool.ts`
- Test: `packages/backend/src/mcp/__tests__/mcp-tool.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/backend/src/mcp/__tests__/mcp-tool.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { McpTool } from "../mcp-tool.js";
import type { ToolRuntime } from "../../tools/base.js";

const mockRuntime: ToolRuntime = {
  sandbox: {} as ToolRuntime["sandbox"],
  conversationId: "test",
};

describe("McpTool", () => {
  it("has correct name with mcp_ prefix", () => {
    const callFn = vi.fn().mockResolvedValue("result");
    const tool = new McpTool(
      "context7",
      "resolve-library-id",
      "Resolve a library ID",
      { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      callFn,
    );
    expect(tool.name).toBe("mcp_context7_resolve-library-id");
  });

  it("returns correct JSON Schema via toJsonTool() without Zod", () => {
    const inputSchema = {
      type: "object",
      properties: {
        libraryName: { type: "string", description: "Library name" },
      },
      required: ["libraryName"],
    };
    const callFn = vi.fn();
    const tool = new McpTool("context7", "resolve-library-id", "Resolve lib", inputSchema, callFn);

    const jsonTool = tool.toJsonTool();
    expect(jsonTool.name).toBe("mcp_context7_resolve-library-id");
    expect(jsonTool.description).toBe("[context7] Resolve lib");
    expect(jsonTool.input_schema).toBe(inputSchema);
  });

  it("delegates _call to the provided callFn", async () => {
    const callFn = vi.fn().mockResolvedValue("tool output text");
    const tool = new McpTool("context7", "query-docs", "Query docs", {}, callFn);

    const result = await tool.call(mockRuntime, { query: "react hooks" });
    expect(result).toBe("tool output text");
    expect(callFn).toHaveBeenCalledWith("mcp_context7_query-docs", { query: "react hooks" });
  });

  it("returns error string when callFn throws", async () => {
    const callFn = vi.fn().mockRejectedValue(new Error("MCP server crashed"));
    const tool = new McpTool("srv", "tool1", "desc", {}, callFn);

    const result = await tool.call(mockRuntime, {});
    expect(result).toContain("Error");
    expect(result).toContain("MCP server crashed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/backend && npx vitest run src/mcp/__tests__/mcp-tool.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement McpTool**

Create `packages/backend/src/mcp/mcp-tool.ts`:

```typescript
import * as z from "zod";
import { BaseTool, type ToolRuntime } from "../tools/base.js";

type McpCallFn = (fullName: string, input: Record<string, unknown>) => Promise<string>;

export class McpTool extends BaseTool<z.ZodObject<z.ZodRawShape>> {
  name: string;
  description: string;
  schema = z.object({});

  private fullName: string;
  private mcpInputSchema: Record<string, unknown>;
  private callFn: McpCallFn;

  constructor(
    serverId: string,
    toolName: string,
    toolDescription: string,
    inputSchema: Record<string, unknown>,
    callFn: McpCallFn,
  ) {
    super();
    this.fullName = `mcp_${serverId}_${toolName}`;
    this.name = this.fullName;
    this.description = `[${serverId}] ${toolDescription}`;
    this.mcpInputSchema = inputSchema;
    this.callFn = callFn;
  }

  override toJsonTool() {
    return {
      name: this.fullName,
      description: this.description,
      input_schema: this.mcpInputSchema,
    };
  }

  protected async _call(_runtime: ToolRuntime, input: z.infer<typeof this.schema>): Promise<string> {
    return this.callFn(this.fullName, input as Record<string, unknown>);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/backend && npx vitest run src/mcp/__tests__/mcp-tool.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/mcp/mcp-tool.ts packages/backend/src/mcp/__tests__/mcp-tool.test.ts
git commit -m "feat: implement McpTool adapter (BaseTool for MCP tools)"
```

---

### Task 6: McpTools manager class

**Files:**
- Create: `packages/backend/src/mcp/mcp-tools.ts`
- Test: `packages/backend/src/mcp/__tests__/mcp-tools.test.ts`

- [ ] **Step 1: Install @modelcontextprotocol/sdk**

```bash
cd packages/backend && pnpm add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Write the test file**

Create `packages/backend/src/mcp/__tests__/mcp-tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpTools, type McpServerConfig } from "../mcp-tools.js";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "resolve-library-id",
          description: "Resolve a library ID",
          inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        },
        {
          name: "get-library-docs",
          description: "Get library docs",
          inputSchema: { type: "object", properties: { libraryId: { type: "string" } } },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "tool result content" }],
    }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn().mockReturnValue({
    pid: 12345,
    stdin: {},
    stdout: {},
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  }),
}));

describe("McpTools", () => {
  let mcpTools: McpTools;

  beforeEach(() => {
    mcpTools = new McpTools();
  });

  it("initializes and discovers tools from MCP servers", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    const tools = await mcpTools.initialize(configs);

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("mcp_context7_resolve-library-id");
    expect(tools[1].name).toBe("mcp_context7_get-library-docs");
  });

  it("generates correct JSON Schema for discovered tools", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    const tools = await mcpTools.initialize(configs);
    const jsonTool = tools[0].toJsonTool();

    expect(jsonTool.name).toBe("mcp_context7_resolve-library-id");
    expect(jsonTool.description).toContain("context7");
    expect(jsonTool.input_schema).toEqual({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    });
  });

  it("hasTool returns true for registered MCP tools", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    await mcpTools.initialize(configs);
    expect(mcpTools.hasTool("mcp_context7_resolve-library-id")).toBe(true);
    expect(mcpTools.hasTool("bash")).toBe(false);
  });

  it("callTool routes to correct MCP client", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    await mcpTools.initialize(configs);
    const result = await mcpTools.callTool("mcp_context7_resolve-library-id", { query: "react" });

    expect(result).toBe("tool result content");
  });

  it("callTool returns error for unknown tool", async () => {
    await mcpTools.initialize([]);
    const result = await mcpTools.callTool("mcp_unknown_tool", {});
    expect(result).toContain("Error");
    expect(result).toContain("Unknown MCP tool");
  });

  it("cleanup closes clients and kills processes", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    await mcpTools.initialize(configs);
    await mcpTools.cleanup();

    // After cleanup, hasTool should return false
    expect(mcpTools.hasTool("mcp_context7_resolve-library-id")).toBe(false);
  });

  it("skips servers that fail to connect without blocking others", async () => {
    // The mock always succeeds, but we can test with an empty config
    const configs: McpServerConfig[] = [];
    const tools = await mcpTools.initialize(configs);
    expect(tools).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd packages/backend && npx vitest run src/mcp/__tests__/mcp-tools.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement McpTools**

Create `packages/backend/src/mcp/mcp-tools.ts`:

```typescript
import { spawn, type ChildProcess } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpTool } from "./mcp-tool.js";

export interface McpServerConfig {
  serverId: string;
  command: string;
  args: string[];
  envVars: Record<string, string>;
}

interface McpConnection {
  client: Client;
  process: ChildProcess;
}

export class McpTools {
  private connections = new Map<string, McpConnection>();
  private toolMap = new Map<string, { serverId: string; toolName: string }>();

  async initialize(servers: McpServerConfig[]): Promise<McpTool[]> {
    const allTools: McpTool[] = [];

    for (const server of servers) {
      try {
        const tools = await this.connectServer(server);
        allTools.push(...tools);
      } catch (err) {
        console.error(`[mcp] Failed to connect to ${server.serverId}:`, err);
        // Skip this server, continue with others
      }
    }

    return allTools;
  }

  hasTool(name: string): boolean {
    return this.toolMap.has(name);
  }

  async callTool(fullName: string, input: Record<string, unknown>): Promise<string> {
    const routing = this.toolMap.get(fullName);
    if (!routing) {
      return `Error: Unknown MCP tool: ${fullName}`;
    }

    const connection = this.connections.get(routing.serverId);
    if (!connection) {
      return `Error: MCP server ${routing.serverId} not connected`;
    }

    try {
      const result = await connection.client.callTool({
        name: routing.toolName,
        arguments: input,
      });

      if (!result.content || !Array.isArray(result.content)) {
        return "Tool executed successfully (no output)";
      }

      const textParts: string[] = [];
      for (const item of result.content) {
        if (typeof item === "object" && item !== null && "text" in item) {
          textParts.push(String(item.text));
        } else {
          textParts.push(String(item));
        }
      }

      return textParts.join("\n") || "Tool executed successfully (no output)";
    } catch (err) {
      return `Error calling MCP tool ${fullName}: ${String(err)}`;
    }
  }

  async cleanup(): Promise<void> {
    for (const [serverId, conn] of this.connections) {
      try {
        await conn.client.close();
      } catch (err) {
        console.error(`[mcp] Error closing client for ${serverId}:`, err);
      }
      try {
        conn.process.kill();
      } catch {
        // Process may already be dead
      }
    }
    this.connections.clear();
    this.toolMap.clear();
  }

  private async connectServer(config: McpServerConfig): Promise<McpTool[]> {
    const proc = spawn(config.command, config.args, {
      env: { ...process.env, ...config.envVars },
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[mcp:${config.serverId}] ${data.toString()}`);
    });

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.envVars },
    });

    const client = new Client({ name: "code-artisan", version: "1.0.0" });
    await client.connect(transport);

    this.connections.set(config.serverId, { client, process: proc });

    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools || [];

    const callFn = this.callTool.bind(this);

    return tools.map((tool) => {
      const fullName = `mcp_${config.serverId}_${tool.name}`;
      this.toolMap.set(fullName, { serverId: config.serverId, toolName: tool.name });

      return new McpTool(
        config.serverId,
        tool.name,
        tool.description || tool.name,
        tool.inputSchema as Record<string, unknown>,
        callFn,
      );
    });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/backend && npx vitest run src/mcp/__tests__/mcp-tools.test.ts
```

Expected: All 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/mcp/mcp-tools.ts packages/backend/src/mcp/__tests__/mcp-tools.test.ts
git commit -m "feat: implement McpTools manager (spawn, connect, discover, call, cleanup)"
```

---

### Task 7: Agent integration

**Files:**
- Modify: `packages/backend/src/agent/agent.ts`
- Modify: `packages/backend/src/agent/types.ts`
- Modify: `packages/backend/src/routes/conversations.ts`

- [ ] **Step 1: Add userId to AgentConfig**

In `packages/backend/src/agent/types.ts`, add `userId` to `AgentConfig`:

```typescript
export interface AgentConfig {
  conversationId: string;
  userId: string;
  userParts?: MessagePart[];
  maxIterations?: number;
}
```

- [ ] **Step 2: Add MCP initialization to Agent.run()**

In `packages/backend/src/agent/agent.ts`, add import for McpTools and DB:

```typescript
import { McpTools } from "../mcp/mcp-tools.js";
import { mcpServers } from "../db/schema.js";
```

Then add MCP import for the registry JSON reader. Create a helper function at the top of the file (after imports):

```typescript
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadMcpRegistry(): Record<string, { command: string; args: string[] }> {
  try {
    const registryPath = join(__dirname, "../mcp/mcp-registry.json");
    const data = JSON.parse(readFileSync(registryPath, "utf-8"));
    const map: Record<string, { command: string; args: string[] }> = {};
    for (const server of data.servers) {
      map[server.id] = { command: server.command, args: server.args };
    }
    return map;
  } catch {
    return {};
  }
}
```

- [ ] **Step 3: Modify Agent.run() to initialize MCP tools**

In `packages/backend/src/agent/agent.ts`, update the `run()` method. Add MCP initialization after creating the runtime, and cleanup in finally:

```typescript
async run(config: AgentConfig): Promise<void> {
    const { conversationId, userId, userParts, maxIterations = 10 } = config;

    const ac = new AbortController();
    runningAgents.set(conversationId, ac);

    let runtime: AgentRuntime | null = null;
    const mcpTools = new McpTools();

    try {
      runtime = await this.initRuntime(conversationId);

      // Initialize MCP tools for this user
      const installedServers = await db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.userId, userId));

      if (installedServers.length > 0) {
        const registryMap = loadMcpRegistry();
        const mcpConfigs = installedServers
          .filter((s) => registryMap[s.serverId])
          .map((s) => ({
            serverId: s.serverId,
            command: registryMap[s.serverId].command,
            args: registryMap[s.serverId].args,
            envVars: (s.envVars as Record<string, string>) || {},
          }));

        const mcpToolInstances = await mcpTools.initialize(mcpConfigs);
        for (const tool of mcpToolInstances) {
          this.registry.register(tool);
        }
      }

      // ... rest of existing run() logic unchanged ...
```

Update the finally block to include MCP cleanup:

```typescript
    } finally {
      runningAgents.delete(conversationId);
      eventBus.emitStream(conversationId, { type: "stream-finish" });
      await mcpTools.cleanup();
    }
```

- [ ] **Step 4: Pass userId in conversations route**

In `packages/backend/src/routes/conversations.ts`, update both `POST /:id/messages` and `POST /:id/confirm` to pass userId to agent.run():

For `POST /:id/messages` (around line 207):
```typescript
  agent.run({ conversationId: id, userId: conv.userId, userParts })
```

For `POST /:id/confirm` (around line 247):
```typescript
  agent.run({ conversationId: id, userId: conv.userId })
```

Both routes already query the conversation (`conv`), which has `userId`.

- [ ] **Step 5: Update conversation select to include userId**

In `POST /:id/messages`, the existing select already gets the full `conv` object. Verify `conv.userId` is accessible (it uses `select()` with full row). Same for `POST /:id/confirm`.

If the confirm route only selects specific fields, update it to include userId:

```typescript
const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
```

- [ ] **Step 6: Run full test suite**

```bash
cd packages/backend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/agent/agent.ts packages/backend/src/agent/types.ts packages/backend/src/routes/conversations.ts
git commit -m "feat: integrate MCP tools into agent run lifecycle"
```

---

### Task 8: Backend MCP API routes

**Files:**
- Create: `packages/backend/src/routes/mcp-servers.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Create the MCP servers router**

Create `packages/backend/src/routes/mcp-servers.ts`:

```typescript
import { Hono } from "hono";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { db } from "../db/index.js";
import { mcpServers } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { McpRegistryServer, McpServerListItem } from "@code-artisan/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadRegistry(): McpRegistryServer[] {
  const registryPath = join(__dirname, "../mcp/mcp-registry.json");
  const data = JSON.parse(readFileSync(registryPath, "utf-8"));
  return data.servers;
}

const mcpServersRouter = new Hono();

// Hardcoded user for now (same pattern as /api/quota)
const HARDCODED_USER_ID = "00000000-0000-0000-0000-000000000000";

// GET / — list all servers with install status
mcpServersRouter.get("/", async (c) => {
  const search = c.req.query("search")?.toLowerCase();
  const registry = loadRegistry();

  const installed = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, HARDCODED_USER_ID));

  const installedMap = new Map(installed.map((s) => [s.serverId, s]));

  let result: McpServerListItem[] = registry.map((server) => {
    const inst = installedMap.get(server.id);
    return {
      ...server,
      installed: !!inst,
      installedId: inst?.id,
    };
  });

  if (search) {
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.description.toLowerCase().includes(search) ||
        s.tags.some((t) => t.toLowerCase().includes(search)),
    );
  }

  return c.json(result);
});

// POST /install — install a server
mcpServersRouter.post("/install", async (c) => {
  const { serverId, envVars } = await c.req.json<{
    serverId: string;
    envVars: Record<string, string>;
  }>();

  // Validate serverId exists in registry
  const registry = loadRegistry();
  const serverDef = registry.find((s) => s.id === serverId);
  if (!serverDef) {
    return c.json({ error: `Server "${serverId}" not found in registry` }, 400);
  }

  // Validate required envVars
  const missingVars = serverDef.envVars
    .filter((v) => v.required && !envVars[v.name])
    .map((v) => v.name);

  if (missingVars.length > 0) {
    return c.json({ error: `Missing required parameters: ${missingVars.join(", ")}` }, 400);
  }

  // Insert (upsert to handle re-install)
  const [row] = await db
    .insert(mcpServers)
    .values({
      userId: HARDCODED_USER_ID,
      serverId,
      envVars,
    })
    .onConflictDoUpdate({
      target: [mcpServers.userId, mcpServers.serverId],
      set: { envVars },
    })
    .returning();

  return c.json({ id: row.id }, 201);
});

// DELETE /:id — uninstall a server
mcpServersRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const deleted = await db
    .delete(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, HARDCODED_USER_ID)))
    .returning();

  if (deleted.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

// PATCH /:id — update envVars
mcpServersRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const { envVars } = await c.req.json<{ envVars: Record<string, string> }>();

  const [updated] = await db
    .update(mcpServers)
    .set({ envVars })
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, HARDCODED_USER_ID)))
    .returning();

  if (!updated) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { mcpServersRouter };
```

- [ ] **Step 2: Register the router in index.ts**

In `packages/backend/src/index.ts`, add the import and route:

```typescript
import { mcpServersRouter } from "./routes/mcp-servers.js";
```

Add after the existing route registrations:

```typescript
app.route("/api/mcp-servers", mcpServersRouter);
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/mcp-servers.ts packages/backend/src/index.ts
git commit -m "feat: add MCP servers REST API (list, install, uninstall, update)"
```

---

### Task 9: Frontend API hooks

**Files:**
- Create: `packages/frontend/src/lib/apis/mcp-servers.ts`
- Modify: `packages/frontend/src/lib/apis/index.ts`

- [ ] **Step 1: Create MCP servers API hooks**

Create `packages/frontend/src/lib/apis/mcp-servers.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { McpServerListItem } from "@code-artisan/shared";

const mcpServersApi = {
  list: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiFetch<McpServerListItem[]>(`/mcp-servers${params}`);
  },
  install: (serverId: string, envVars: Record<string, string>) =>
    apiFetch<{ id: string }>("/mcp-servers/install", {
      method: "POST",
      body: JSON.stringify({ serverId, envVars }),
    }),
  uninstall: (id: string) =>
    apiFetch<{ success: boolean }>(`/mcp-servers/${id}`, { method: "DELETE" }),
  update: (id: string, envVars: Record<string, string>) =>
    apiFetch<{ success: boolean }>(`/mcp-servers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ envVars }),
    }),
};

export function useMcpServers(search?: string) {
  return useQuery({
    queryKey: ["mcp-servers", search ?? ""],
    queryFn: () => mcpServersApi.list(search),
  });
}

export function useInstallMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, envVars }: { serverId: string; envVars: Record<string, string> }) =>
      mcpServersApi.install(serverId, envVars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });
}

export function useUninstallMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mcpServersApi.uninstall(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });
}

export function useUpdateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, envVars }: { id: string; envVars: Record<string, string> }) =>
      mcpServersApi.update(id, envVars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });
}
```

- [ ] **Step 2: Export from index**

Add to `packages/frontend/src/lib/apis/index.ts`:

```typescript
export {
  useMcpServers,
  useInstallMcpServer,
  useUninstallMcpServer,
  useUpdateMcpServer,
} from "./mcp-servers";
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/apis/mcp-servers.ts packages/frontend/src/lib/apis/index.ts
git commit -m "feat: add frontend API hooks for MCP servers"
```

---

### Task 10: Frontend MCP Servers page

**Files:**
- Create: `packages/frontend/src/routes/mcp-servers.tsx`
- Modify: `packages/frontend/src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Add sidebar link**

In `packages/frontend/src/components/layout/app-sidebar.tsx`, add a "MCP Servers" link. Import the `Plug` icon and add a link after the Home link:

Add import:
```typescript
import { Plus, Home, Trash2, Plug } from "lucide-react";
```

Add after the Home `<Link>` block (after the closing `</Link>` of Home, before `<ScrollArea>`):

```tsx
        <Link
          to="/mcp-servers"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
        >
          <Plug className="h-4 w-4" /> MCP Servers
        </Link>
```

- [ ] **Step 2: Create the MCP Servers page**

Create `packages/frontend/src/routes/mcp-servers.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ExternalLink, Download, Trash2, Settings, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  useMcpServers,
  useInstallMcpServer,
  useUninstallMcpServer,
  useUpdateMcpServer,
} from "@/lib/apis";
import type { McpServerListItem, McpEnvVar } from "@code-artisan/shared";

export const Route = createFileRoute("/mcp-servers")({
  component: McpServersPage,
});

function McpServersPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"marketplace" | "installed">("marketplace");
  const [installTarget, setInstallTarget] = useState<McpServerListItem | null>(null);
  const [editTarget, setEditTarget] = useState<McpServerListItem | null>(null);

  const { data: servers = [], isLoading } = useMcpServers(search || undefined);

  const displayServers =
    tab === "marketplace" ? servers : servers.filter((s) => s.installed);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">MCP Servers</h1>
        <p className="text-sm text-muted-foreground">
          Manage Model Context Protocol servers for extended AI capabilities
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-4 border-b border-border">
        <button
          onClick={() => setTab("marketplace")}
          className={`pb-2 text-sm font-medium ${
            tab === "marketplace"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Marketplace
        </button>
        <button
          onClick={() => setTab("installed")}
          className={`pb-2 text-sm font-medium ${
            tab === "installed"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Installed
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search MCP servers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Server list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : displayServers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === "installed" ? "No MCP servers installed yet." : "No servers found."}
        </p>
      ) : (
        <div className="space-y-3">
          {displayServers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onInstall={() => setInstallTarget(server)}
              onUninstall={() => {}}
              onEdit={() => setEditTarget(server)}
            />
          ))}
        </div>
      )}

      {/* Install Dialog */}
      {installTarget && (
        <InstallDialog
          server={installTarget}
          onClose={() => setInstallTarget(null)}
        />
      )}

      {/* Edit Dialog */}
      {editTarget && (
        <EditDialog
          server={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

function ServerCard({
  server,
  onInstall,
  onEdit,
}: {
  server: McpServerListItem;
  onInstall: () => void;
  onUninstall: () => void;
  onEdit: () => void;
}) {
  const uninstall = useUninstallMcpServer();

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{server.name}</h3>
            {server.featured && (
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Star className="h-3 w-3" /> Featured
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            by {server.author} · {server.category}
          </p>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {server.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {server.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {server.tags.length > 4 && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                +{server.tags.length - 4}
              </span>
            )}
          </div>
        </div>

        <div className="ml-4 flex items-center gap-2">
          <a
            href={server.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          {server.installed ? (
            <div className="flex gap-1">
              {server.envVars.length > 0 && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Settings className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => server.installedId && uninstall.mutate(server.installedId)}
                disabled={uninstall.isPending}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Uninstall
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={onInstall}>
              <Download className="mr-1 h-3.5 w-3.5" /> Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InstallDialog({
  server,
  onClose,
}: {
  server: McpServerListItem;
  onClose: () => void;
}) {
  const install = useInstallMcpServer();
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  const requiredVarsFilled = server.envVars
    .filter((v) => v.required)
    .every((v) => envVars[v.name]?.trim());

  const canInstall = server.envVars.length === 0 || requiredVarsFilled;

  async function handleInstall() {
    await install.mutateAsync({ serverId: server.id, envVars });
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{server.name}</DialogTitle>
          <DialogDescription>
            by {server.author} · {server.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <a
            href={server.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View Documentation
          </a>

          {server.envVars.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Required Parameters</h4>
              {server.envVars.map((envVar) => (
                <EnvVarInput
                  key={envVar.name}
                  envVar={envVar}
                  value={envVars[envVar.name] || ""}
                  onChange={(val) =>
                    setEnvVars((prev) => ({ ...prev, [envVar.name]: val }))
                  }
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleInstall}
            disabled={!canInstall || install.isPending}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            {install.isPending ? "Installing..." : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  server,
  onClose,
}: {
  server: McpServerListItem;
  onClose: () => void;
}) {
  const update = useUpdateMcpServer();
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  async function handleSave() {
    if (!server.installedId) return;
    await update.mutateAsync({ id: server.installedId, envVars });
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {server.name}</DialogTitle>
          <DialogDescription>Update configuration parameters</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {server.envVars.map((envVar) => (
            <EnvVarInput
              key={envVar.name}
              envVar={envVar}
              value={envVars[envVar.name] || ""}
              onChange={(val) =>
                setEnvVars((prev) => ({ ...prev, [envVar.name]: val }))
              }
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnvVarInput({
  envVar,
  value,
  onChange,
}: {
  envVar: McpEnvVar;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <Label className="text-sm">
        {envVar.label}
        {envVar.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        placeholder={envVar.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
      <p className="mt-1 text-xs text-muted-foreground">{envVar.description}</p>
    </div>
  );
}
```

- [ ] **Step 3: Regenerate route tree**

```bash
cd packages/frontend && npx tsr generate
```

This updates `routeTree.gen.ts` to include the new `/mcp-servers` route.

- [ ] **Step 4: Verify frontend builds**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/routes/mcp-servers.tsx packages/frontend/src/components/layout/app-sidebar.tsx packages/frontend/src/routeTree.gen.ts
git commit -m "feat: add MCP Servers page with marketplace, install dialog, and sidebar link"
```

---

### Task 11: Run full test suite and smoke test

- [ ] **Step 1: Run backend tests**

```bash
cd packages/backend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run frontend type check**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Manual smoke test**

1. Run DB migration: `cd packages/backend && npx drizzle-kit push`
2. Start dev server: `pnpm dev`
3. Open browser → click "MCP Servers" in sidebar
4. Verify: Marketplace tab shows 4 servers, search works, featured badges show
5. Click "Install" on Context7 (no params needed) → should install
6. Switch to "Installed" tab → Context7 shows with Uninstall button
7. Start a new chat → ask agent to "use Context7 to look up React hooks documentation"
8. Verify agent uses `mcp_context7_*` tools
