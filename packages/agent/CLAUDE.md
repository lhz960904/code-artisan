# @code-artisan/agent

Environment-agnostic agent SDK. Runs a ReAct loop: feed messages to an LLM, extract tool uses, execute them via an injected sandbox, feed results back, repeat. Pluggable providers, middleware, sandbox, and tools. Block-based polymorphic message model shared end-to-end with consumers.

## Structure

```text
core/          Agent class + createAgent() factory — the loop itself
  agent.ts       invoke() and stream() async generators
  index.ts       createAgent(): merges user tools/middlewares with defaults (user overrides by name)
types/         Public interfaces
  agent.ts       AgentContext, ModelContext, AgentOptions
  messages/      Block-based content (text, image_url, thinking, tool_use, tool_result); roles system/user/assistant/tool; AssistantMessage carries usage
  provider/      LLMProvider abstract (invoke + stream)
  middleware.ts  8 hooks: before|afterModel, before|afterAgentRun, before|afterAgentStep, before|afterToolUse
tools/         Registry + builtins
  tool.ts        defineTool(), FunctionTool, ToolContext (sandbox + abortSignal)
  builtins/      bash, read/write/strReplace, glob, grep, ls, webSearch, webFetch
middlewares/   Cross-cutting logic, folder-per-module
  loop-detection/  MD5 hash sliding window of (toolName+input); warn → shouldStop
  micro-compact/   Stub older tool_result content; keep N recent verbatim
  auto-compact/    Summary-based history compaction
  skills/          Load gray-matter frontmatter skills from disk
  todo/            Todo system
sandbox/       Abstraction: exec/readFile/writeFile/listDir/glob/grep
  local.ts       LocalSandbox (Node.js)
community/     Provider impls (anthropic/, openai/)
index.ts       Public exports
```

## Streaming shape

`stream({ mode })` yields `AgentEvent`:
- `AgentPartialEvent` — partial token deltas (tool_use may have incomplete JSON input)
- `AgentMessageEvent` — completed message

`mode: "message"` skips partials. `invoke()` returns the final message array.

## Core abstractions

- **Agent** — stateful loop holding model, tools, middlewares, sandbox, messages.
- **LLMProvider** — abstract `invoke` + `stream`.
- **Tool** — Zod input schema + `invoke(input, ctx)`. `ctx` = `{ sandbox, abortSignal }`.
- **Middleware** — sequential hooks; return `Partial<AgentContext>` to merge mutations.
- **Sandbox** — injected at agent creation; all builtin tools route through it.

## Conventions

- **Cooperative stop**: middlewares set `agentContext.shouldStop` to exit cleanly after current step — never throw to stop.
- **Block-based content everywhere** — never concat strings; always polymorphic blocks.
- **Folder-per-module** for middlewares/tools. Classes only for heavy stateful logic (Agent).
- **YAGNI**: minimal constructors, per-call options over config.

## Tech

Bun + TS. `@anthropic-ai/sdk`, `openai`, `@modelcontextprotocol/sdk`, `@e2b/code-interpreter`, `zod`, `gray-matter`.

## Relationship

Consumed by `@code-artisan/backend`, which injects `E2BSandbox`, wraps MCP tools via `defineTool`, adds quota middleware, and pipes `agent.stream()` into SSE. The message model is unified — backend persists JSONB that mirrors these shapes and rebuilds them via a bridge function.
