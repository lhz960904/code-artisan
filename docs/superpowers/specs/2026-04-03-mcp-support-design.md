# MCP Support Design

## Overview

Add Model Context Protocol (MCP) support to code-artisan. Users browse a curated marketplace of MCP servers, install with one click (filling required API keys), and the agent automatically uses installed MCP tools alongside builtin tools. No manual config editing.

## Decisions

- **Data source**: Self-maintained static `mcp-registry.json` — only web-coding-relevant servers
- **Transport**: stdio only (spawn child process on backend server)
- **Scope**: Per-user global — install once, all conversations use it
- **Lifecycle**: Spawn on agent run start, kill on agent run end. Accept npx cold-start latency (~0.5-5s depending on cache)
- **Install config**: Dialog with required parameter inputs (API keys etc.)
- **MCP SDK**: `@modelcontextprotocol/sdk` — official SDK handles protocol handshake, tool discovery, tool calls
- **ToolRegistry**: Non-singleton, per-agent-run instance via factory function `createToolRegistry()`
- **No frontend framework changes** — uses existing React + TanStack Router + TanStack Query + shadcn/ui

## Architecture

```
Frontend                                    Backend
┌─────────────────────┐        ┌──────────────────────────────────┐
│  /mcp-servers page  │        │  Hono Routes: /api/mcp-servers   │
│  ┌───────────────┐  │  REST  │  ┌────────────────────────────┐  │
│  │ Marketplace   │──┼───────▶│  │ GET /                      │  │
│  │ tab           │  │        │  │ POST /install              │  │
│  ├───────────────┤  │        │  │ DELETE /:id                │  │
│  │ Installed tab │  │        │  │ PATCH /:id                 │  │
│  └───────────────┘  │        │  └─────────┬──────────────────┘  │
│                     │        │            │                      │
│  Install Dialog     │        │  ┌─────────▼──────────────────┐  │
│  (envVars inputs)   │        │  │ DB: mcp_servers table      │  │
└─────────────────────┘        │  └────────────────────────────┘  │
                               │                                   │
                               │  ── Agent Run ──                  │
                               │  ┌────────────────────────────┐  │
                               │  │ createToolRegistry()       │  │
                               │  │  → builtins (bash, ls...)  │  │
                               │  │  → McpTool[] from McpTools │  │
                               │  └─────────┬──────────────────┘  │
                               │            │                      │
                               │  ┌─────────▼──────────────────┐  │
                               │  │ McpTools                   │  │
                               │  │  spawn → connect → list    │  │
                               │  │  → McpTool extends BaseTool│  │
                               │  │  → callTool() / cleanup()  │  │
                               │  └────────────────────────────┘  │
                               └───────────────────────────────────┘
```

## Data Model

### Static Registry: `mcp-registry.json`

Located at `packages/backend/src/mcp/mcp-registry.json`.

```typescript
interface McpRegistryServer {
  id: string;              // unique id, e.g. "context7"
  name: string;            // display name
  author: string;          // e.g. "upstash"
  description: string;     // what it does
  category: string;        // e.g. "documentation", "web-scraping"
  tags: string[];           // search tags
  command: string;          // e.g. "npx"
  args: string[];           // e.g. ["-y", "@upstash/context7-mcp@latest"]
  envVars: McpEnvVar[];    // required config params
  docUrl: string;          // link to docs/repo
  featured: boolean;       // show featured badge
}

interface McpEnvVar {
  name: string;            // env var name, e.g. "FIRECRAWL_API_KEY"
  label: string;           // display label
  placeholder: string;     // input placeholder
  description: string;     // help text
  required: boolean;
}
```

Example entries (MVP):

| Server | Category | Needs Config |
|--------|----------|-------------|
| Context7 | documentation | No |
| Sequential Thinking | thinking | No |
| Firecrawl | web-scraping | Yes (API key) |
| Brave Search | search | Yes (API key) |

### Database: `mcp_servers` table

```typescript
export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  serverId: text("server_id").notNull(),       // matches registry id
  envVars: jsonb("env_vars").notNull().default({}), // {"API_KEY": "xxx"}
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.userId, table.serverId),
]);
```

No `enabled` field — installed = active, uninstall = delete row.

### Shared Types (`packages/shared`)

```typescript
// Registry server (from static JSON, sent to frontend)
interface McpRegistryServer { ... } // as above

// Installed server (API response, registry + DB joined)
interface McpInstalledServer {
  id: string;           // DB record id
  serverId: string;     // registry id
  envVars: Record<string, string>;
  installedAt: string;
  // joined from registry:
  name: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  docUrl: string;
}

// Combined response for GET /api/mcp-servers
interface McpServerListItem extends McpRegistryServer {
  installed: boolean;
  installedId?: string;  // DB id if installed
}
```

## API Design

### `GET /api/mcp-servers`

Returns registry list with install status per user.

Response: `McpServerListItem[]`

Query params: `?search=keyword` (optional, filters by name/description/tags)

### `POST /api/mcp-servers/install`

Body: `{ serverId: string, envVars: Record<string, string> }`

Validates:
- `serverId` exists in registry
- All required envVars are provided (check against registry's `envVars[].required`)

Response: `{ id: string }` (DB record id)

### `DELETE /api/mcp-servers/:id`

Deletes DB record. Response: `{ success: true }`

### `PATCH /api/mcp-servers/:id`

Body: `{ envVars: Record<string, string> }`

Updates envVars config. Response: `{ success: true }`

## Backend: McpTools

### File: `packages/backend/src/mcp/mcp-tools.ts`

```typescript
class McpTools {
  private clients: Map<string, Client>;           // serverId → MCP SDK Client
  private processes: Map<string, ChildProcess>;    // serverId → spawned process
  private toolMap: Map<string, { serverId: string; toolName: string }>; // fullName → routing info

  /**
   * Spawn and connect to all MCP servers, discover tools.
   * @param servers - user's installed server configs (from DB + registry join)
   */
  async initialize(servers: McpServerConfig[]): Promise<McpTool[]>;

  /**
   * Call an MCP tool by full name (mcp_{serverId}_{toolName}).
   * Routes to the correct Client.
   */
  async callTool(fullName: string, input: Record<string, unknown>): Promise<string>;

  /**
   * Close all Client connections, kill all child processes.
   */
  async cleanup(): Promise<void>;
}
```

`McpServerConfig` (internal, not shared):
```typescript
interface McpServerConfig {
  serverId: string;
  command: string;
  args: string[];
  envVars: Record<string, string>;
}
```

### Initialize flow

For each server config:
1. Spawn child process: `child_process.spawn(command, args, { env: { ...process.env, ...envVars }, stdio: ['pipe', 'pipe', 'pipe'] })`
2. Create `StdioClientTransport` from MCP SDK with the process's stdin/stdout
3. Create `Client` and call `client.connect(transport)`
4. Call `client.listTools()` to discover available tools
5. For each tool: create `McpTool` instance, store routing info in `toolMap`
6. If spawn/connect fails for a server: log error, skip, continue with others

### File: `packages/backend/src/mcp/mcp-tool.ts`

```typescript
class McpTool extends BaseTool {
  name: string;          // "mcp_{serverId}_{toolName}"
  description: string;   // from MCP tool definition
  schema = z.object({});  // placeholder, not used for validation

  constructor(
    private fullName: string,
    private toolDescription: string,
    private inputSchema: Record<string, unknown>,  // MCP JSON Schema
    private mcpTools: McpTools,  // reference to manager for callTool()
  ) { super(); }

  // Override: return MCP's original JSON Schema directly
  toJsonTool() {
    return {
      name: this.fullName,
      description: this.toolDescription,
      input_schema: this.inputSchema,
    };
  }

  // Delegate to McpTools.callTool()
  protected async _call(_runtime: ToolRuntime, input: unknown): Promise<string> {
    return this.mcpTools.callTool(this.fullName, input as Record<string, unknown>);
  }
}
```

## Backend: ToolRegistry Refactor

### Change: singleton → factory function

Current (`tools/index.ts`):
```typescript
export const toolRegistry = new ToolRegistry();
// register builtins...
```

New:
```typescript
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

All consumers of `toolRegistry` (agent.ts, system prompt generation) switch to using the instance returned by `createToolRegistry()`.

## Backend: Agent Integration

### Changes to `agent.ts`

```
Agent.run(userId, conversationId, ...):
  1. registry = createToolRegistry()
  2. Query DB: user's installed MCP servers
  3. Join with registry JSON to get command/args/envVars
  4. mcpTools = new McpTools()
  5. mcpToolInstances = await mcpTools.initialize(serverConfigs)
  6. for (const tool of mcpToolInstances) registry.register(tool)
  7. Agent loop (uses registry for tool defs + execution)
  8. finally: await mcpTools.cleanup()
```

The agent loop itself doesn't change — `registry.get(name).call()` works for both builtin and MCP tools.

System prompt generation via `registry.toPromptSection()` automatically includes MCP tools.

Tool definitions via `registry.toToolDefinitions()` automatically includes MCP tools.

## Frontend

### New route: `/mcp-servers`

File: `packages/frontend/src/routes/mcp-servers.tsx`

### Sidebar entry

Add "MCP Servers" link to `app-sidebar.tsx` with plug icon.

### Page layout (two tabs)

**Marketplace tab:**
- Search input (filters by name/description/tags client-side)
- Server cards in a grid/list layout
- Each card shows: name, author badge, category, description (truncated), tags, featured badge
- "Install" button (or "Installed ✓" if already installed)
- External doc link icon

**Installed tab:**
- List of installed servers
- Each item: name, author, installed date
- Actions: "Uninstall" button, "Edit Config" button (for servers with envVars)

### Install dialog (modal)

Triggered by clicking "Install" on a server card.

Content (reference: user's Firecrawl screenshot):
- Server header: icon area, name, author, description
- "View Documentation" link
- If server has `envVars`: "Required Parameters" section with labeled inputs
- Footer: Cancel / Install buttons
- Install button disabled until all required fields filled

### API integration

- `GET /api/mcp-servers` → TanStack Query hook `useMcpServers()`
- `POST /install` → mutation `useInstallMcpServer()`
- `DELETE /:id` → mutation `useUninstallMcpServer()`
- `PATCH /:id` → mutation `useUpdateMcpServer()`

Invalidate `useMcpServers` query on install/uninstall/update.

## New Dependencies

- `@modelcontextprotocol/sdk` — MCP client SDK (backend)

## Error Handling

| Scenario | Behavior |
|---|---|
| MCP server spawn fails | Log error, skip server, other servers + builtins still work |
| MCP server connect/handshake fails | Log error, skip server |
| MCP tool call fails at runtime | Return error string to agent (same as builtin tool errors via BaseTool.call() try/catch) |
| serverId not in registry on install | 400 Bad Request |
| Required envVars missing on install | 400 Bad Request with field names |
| DB record not found on delete/patch | 404 Not Found |

## Testing

- Unit tests for McpTools (mock child_process.spawn + MCP Client)
- Unit tests for McpTool.toJsonTool() (verify JSON Schema passthrough)
- Unit tests for ToolRegistry factory (verify builtins registered)
- Unit tests for MCP API routes (mock DB)
- Integration test: McpTools.initialize() → produces correct McpTool instances

## Out of Scope

- SSE / Streamable HTTP transport (stdio only for MVP)
- Per-conversation MCP config (global per-user only)
- MCP server connection pooling / caching across agent runs
- External registry API (Smithery, mcp.so)
- Categories dropdown filter (use search only)
- MCP server health monitoring / status indicators
- Pre-installing npm packages in Docker
