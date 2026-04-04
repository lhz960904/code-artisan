# Agent SDK Extraction Design

## Overview

Extract agent orchestration code from `@code-artisan/backend` into an independent `@code-artisan/agent` package. The SDK contains the full agent runtime (execution loop, LLM providers, tools, MCP, middlewares) with zero business logic. Backend imports and consumes the SDK, injecting its own persistence (PostgresCheckpointSaver), sandbox (E2BSandbox), and business middlewares.

## Design Decisions

| Dimension | Decision |
|-----------|----------|
| SDK scope | Full: agent loop + types + providers + tools + MCP + middlewares |
| Sandbox | SDK defines `Sandbox` interface + built-in `LocalSandbox`; E2B injected by backend |
| Streaming | `agent.stream()` returns `AsyncIterable<AgentEvent>`; no EventBus/StreamEmitter |
| Persistence | Checkpoint per iteration; SDK has `InMemoryCheckpointSaver`; backend implements Postgres |
| HITL | Declarative `interruptOn` config + yield interrupt event + `resume()` |
| Middleware | Lifecycle hook chain (before/after model, tool execution, agent) |
| Package location | `packages/agent/` in monorepo, name `@code-artisan/agent` |
| Development | TDD — write tests first, high coverage target |

## Package Structure

```
packages/agent/
├── src/
│   ├── index.ts                        # Public API exports
│   ├── agent.ts                        # Agent class — core execution loop
│   ├── types.ts                        # All interface definitions
│   │
│   ├── providers/
│   │   ├── index.ts                    # Provider exports
│   │   ├── base.ts                     # LLMProvider interface
│   │   ├── anthropic.ts               # Anthropic implementation
│   │   └── anthropic.test.ts
│   │
│   ├── checkpoint/
│   │   ├── index.ts                    # Checkpoint exports
│   │   ├── base.ts                     # CheckpointSaver interface
│   │   ├── memory.ts                   # InMemoryCheckpointSaver
│   │   └── memory.test.ts
│   │
│   ├── sandbox/
│   │   ├── index.ts                    # Sandbox exports
│   │   ├── base.ts                     # Sandbox interface
│   │   ├── local.ts                    # LocalSandbox (local shell execution)
│   │   └── local.test.ts
│   │
│   ├── tools/
│   │   ├── index.ts                    # Tool exports + createDefaultTools()
│   │   ├── base.ts                     # BaseTool abstract class
│   │   ├── base.test.ts
│   │   ├── registry.ts                # ToolRegistry
│   │   ├── registry.test.ts
│   │   ├── bash.ts
│   │   ├── bash.test.ts
│   │   ├── ls.ts
│   │   ├── ls.test.ts
│   │   ├── read-file.ts
│   │   ├── read-file.test.ts
│   │   ├── write-file.ts
│   │   ├── write-file.test.ts
│   │   ├── str-replace.ts
│   │   ├── str-replace.test.ts
│   │   ├── start-server.ts
│   │   ├── start-server.test.ts
│   │   ├── web-search.ts
│   │   └── web-fetch.ts
│   │
│   ├── mcp/
│   │   ├── index.ts                    # MCP exports
│   │   ├── mcp-tools.ts              # MCP dynamic tool loading
│   │   └── mcp-tools.test.ts
│   │
│   ├── middlewares/
│   │   ├── index.ts                    # Middleware exports + defaultMiddlewares()
│   │   ├── dangling-tool-call.ts
│   │   ├── dangling-tool-call.test.ts
│   │   ├── micro-compact.ts
│   │   ├── micro-compact.test.ts
│   │   ├── auto-compact.ts
│   │   ├── auto-compact.test.ts
│   │   ├── loop-detection.ts
│   │   └── loop-detection.test.ts
│   │
│   ├── agent.ts                        # Agent class
│   ├── agent.test.ts                   # Agent execution loop tests
│   ├── agent.interrupt.test.ts         # HITL interrupt/resume tests
│
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Core Interfaces

### AgentConfig

```typescript
interface AgentConfig {
  threadId: string;
  provider: LLMProvider;
  sandbox: Sandbox;
  tools?: BaseTool[];
  mcpServers?: McpServerConfig[];
  middlewares?: AgentMiddleware[];
  checkpoint?: CheckpointSaver;
  systemPrompt?: string;
  model?: string;
  maxIterations?: number;       // default: 10
  maxTokens?: number;           // default: 16384
  thinking?: { enabled: boolean; budget: number };
  interruptOn?: Record<string, InterruptConfig>;
}

interface InterruptConfig {
  decisions: string[];          // e.g. ["approve", "reject"]
  description?: string;
}
```

### AgentState (checkpoint payload)

```typescript
interface AgentState {
  messages: Message[];
  usage: { inputTokens: number; outputTokens: number };
  status: "running" | "interrupted" | "completed" | "error";
  pendingToolCalls?: ToolCallInfo[];
}
```

### AgentEvent (stream output)

```typescript
type AgentEvent =
  | MessageStreamEvent                                    // text/thinking/tool deltas
  | { type: "iteration_complete"; state: AgentState }
  | { type: "interrupt"; toolCalls: ToolCallInfo[] }
  | { type: "agent_complete"; usage: TokenUsage }
  | { type: "error"; error: Error };
```

### CheckpointSaver

```typescript
interface CheckpointSaver {
  save(threadId: string, state: AgentState): Promise<void>;
  restore(threadId: string): Promise<AgentState | null>;
}
```

### Sandbox

```typescript
interface Sandbox {
  exec(command: string, opts?: ExecOptions): Promise<ExecResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path: string, depth?: number): Promise<FileEntry[]>;
}

interface ExecOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

### LLMProvider

```typescript
interface LLMProvider {
  stream(params: MessageStreamParams): AsyncIterable<MessageStreamEvent>;
  generateText(params: GenerateTextParams): Promise<string>;
}

interface MessageStreamParams {
  model: string;
  system: string;
  messages: ProviderMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
  thinking?: { enabled: boolean; budget: number };
}
```

### AgentMiddleware

```typescript
interface AgentMiddleware {
  name: string;
  beforeAgent?(ctx: AgentContext): Promise<void>;
  beforeModel?(ctx: AgentContext): Promise<void>;
  afterModel?(ctx: AgentContext, response: LLMResponse): Promise<void>;
  afterToolExecution?(ctx: AgentContext, results: ToolResult[]): Promise<void>;
  afterAgent?(ctx: AgentContext): Promise<void>;
}
```

### AgentContext (runtime context for middlewares)

```typescript
interface AgentContext {
  threadId: string;
  messages: Message[];
  sandbox: Sandbox;
  provider: LLMProvider;
  tools: ToolRegistry;
  usage: { inputTokens: number; outputTokens: number };
  state: Map<string, unknown>;   // shared data between middlewares
  shouldStop: boolean;
}
```

### BaseTool

```typescript
abstract class BaseTool<T extends ZodSchema = ZodSchema> {
  abstract name: string;
  abstract description: string;
  abstract schema: T;
  abstract execute(sandbox: Sandbox, input: z.infer<T>): Promise<string>;

  // Built-in: validate input → call execute → truncate output → catch errors
  async call(sandbox: Sandbox, rawInput: unknown): Promise<string>;

  // Convert to JSON Schema for LLM
  toDefinition(): ToolDefinition;
}
```

## Execution Loop

```
agent.stream(input):
  state = checkpoint?.restore(threadId) ?? { messages: [], usage: {}, status: "running" }

  if state.status === "running":
    state.messages.push(userMessage(input))

  run middlewares: beforeAgent(ctx)

  for i in 0..maxIterations:
    run middlewares: beforeModel(ctx)

    for await event of provider.stream({ messages, tools, ... }):
      yield event                         // passthrough to consumer
      collect into llmResponse

    run middlewares: afterModel(ctx, llmResponse)
    state.messages.push(assistantMessage(llmResponse))

    if llmResponse.stopReason !== "tool_calls":
      break

    // Check interruptOn
    toolCalls = llmResponse.toolCalls
    interruptedTools = toolCalls.filter(tc => interruptOn[tc.name])

    if interruptedTools.length > 0:
      state.status = "interrupted"
      state.pendingToolCalls = toolCalls
      checkpoint?.save(threadId, state)
      yield { type: "interrupt", toolCalls }
      return                              // pause, wait for resume()

    // Execute tools in parallel
    results = await Promise.all(toolCalls.map(tc => executeToolCall(tc)))
    run middlewares: afterToolExecution(ctx, results)
    state.messages.push(...toolResultMessages(results))

    // Checkpoint after each iteration
    checkpoint?.save(threadId, state)
    yield { type: "iteration_complete", state }

  run middlewares: afterAgent(ctx)
  state.status = "completed"
  checkpoint?.save(threadId, state)
  yield { type: "agent_complete", usage: state.usage }
```

### resume() flow

```
agent.resume(threadId, decision):
  state = checkpoint.restore(threadId)
  assert state.status === "interrupted"

  if decision.action === "approve":
    results = await executeTools(state.pendingToolCalls)
    state.messages.push(...toolResultMessages(results))
  else:
    state.messages.push(rejectionMessage(decision))

  state.status = "running"
  state.pendingToolCalls = undefined

  // Continue the execution loop (same as stream, but skip initial user message)
  ...continue iteration loop, yielding events...
```

## Built-in Implementations

### LocalSandbox

Executes commands on the local machine via `child_process.exec`. File operations via `node:fs`.

- `exec()` → `child_process.execFile("/bin/bash", ["-c", command])`
- `readFile()` → `fs.readFile()`
- `writeFile()` → `fs.writeFile()` (auto-create directories)
- `listDir()` → recursive `fs.readdir()` with depth limit

Suitable for local development and testing. Production uses E2BSandbox injected by backend.

### InMemoryCheckpointSaver

Simple `Map<string, AgentState>` for development and testing. No persistence across process restarts.

### Default Middlewares

SDK exports `defaultMiddlewares()` returning:
1. `DanglingToolCallMiddleware` — clean up malformed tool calls
2. `MicroCompactMiddleware` — prune old tool outputs when message count is high
3. `AutoCompactMiddleware` — LLM-based summarization when token count > threshold
4. `LoopDetectionMiddleware` — detect repetitive tool calls, warn or stop

Backend can extend: `[...Agent.defaultMiddlewares(), new TitleGenMiddleware(db)]`

## Backend Integration Example

```typescript
import {
  Agent, AnthropicProvider, defaultMiddlewares
} from "@code-artisan/agent";
import { PostgresCheckpointSaver } from "./checkpoint/postgres";
import { E2BSandbox } from "./sandbox/e2b";
import { TitleGenerationMiddleware } from "./middlewares/title-generation";
import { TokenUsageMiddleware } from "./middlewares/token-usage";

// POST /conversations/:id/messages
const agent = new Agent({
  threadId: conversationId,
  provider: new AnthropicProvider({ apiKey }),
  sandbox: new E2BSandbox(sandboxId),
  checkpoint: new PostgresCheckpointSaver(db),
  systemPrompt: buildSystemPrompt(tools),
  model: "claude-sonnet-4-6-20250514",
  middlewares: [
    ...defaultMiddlewares(),
    new TitleGenerationMiddleware(db),
    new TokenUsageMiddleware(db),
  ],
  interruptOn: mode === "confirm" ? {
    bash: { decisions: ["approve", "reject"] },
    write_file: { decisions: ["approve", "reject"] },
  } : {},
});

// Stream → SSE
const stream = new ReadableStream({
  async start(controller) {
    for await (const event of agent.stream({ parts: userParts })) {
      if (event.type === "interrupt") {
        await db.update(conversations)
          .set({ pendingConfirm: event.toolCalls })
          .where(eq(conversations.id, conversationId));
      }
      controller.enqueue(formatSSE(event));
    }
    controller.close();
  },
});

// POST /conversations/:id/confirm
for await (const event of agent.resume(conversationId, { action: "approve" })) {
  sseController.enqueue(formatSSE(event));
}
```

## What Stays in Backend

| Module | Reason |
|--------|--------|
| `PostgresCheckpointSaver` | Depends on Drizzle + app DB schema |
| `E2BSandbox` | Depends on E2B SDK + sandbox lifecycle management |
| `TitleGenerationMiddleware` | Accesses conversations table |
| `TokenUsageMiddleware` | Accesses user quota tables |
| `routes/conversations.ts` | HTTP routing, SSE, auth |
| `services/event-bus.ts` | SSE push infrastructure |
| File snapshot side effects | Business logic (save snapshots to DB on write_file) |

## Shared Types

`@code-artisan/shared` continues to hold `Message`, `MessagePart`, `MessageStreamEvent` types used by both frontend and agent SDK. The agent SDK depends on `@code-artisan/shared`.

## Testing Strategy

TDD approach — tests written before implementation for each module.

| Module | Test Focus |
|--------|-----------|
| `Agent` | Execution loop: iteration count, stop conditions, event sequence |
| `Agent interrupt` | HITL: interrupt yield, resume approve/reject, checkpoint save/restore |
| `InMemoryCheckpointSaver` | save/restore/overwrite, null on missing threadId |
| `LocalSandbox` | exec commands, read/write files, listDir depth, error handling |
| `AnthropicProvider` | Message format conversion, stream event mapping, error handling |
| `BaseTool` | Input validation, output truncation, error wrapping |
| `ToolRegistry` | Register, get, list definitions, duplicate name rejection |
| Each built-in tool | Input/output for happy path + edge cases (via mocked sandbox) |
| Each middleware | Hook invocation, state mutation, edge cases |
| MCP tools | Dynamic loading, tool call delegation |

All tests use mocked dependencies (mock LLMProvider, mock Sandbox, mock CheckpointSaver) to ensure isolation and fast execution.
