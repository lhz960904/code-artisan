# @code-artisan/agent

Environment-agnostic agent SDK. Runs a ReAct loop: feed messages to an LLM, extract tool uses, execute them via an injected sandbox, feed results back, repeat. Pluggable providers, middleware, sandbox, and tools. Block-based polymorphic message model shared end-to-end with consumers.

## Structure

```text
core/          Agent class + createAgent() factory — the loop itself
  agent.ts       invoke() and stream() async generators
  index.ts       createAgent(): auto-wires skills + todo + loop-detection, appends user middlewares/tools
prompts/       Composable system-prompt sections
  sections.ts    DEFAULT_IDENTITY + 6 section constants (System / Doing tasks / Executing actions /
                   Using tools / Tone and style / Communicating)
  compose.ts     composeSystemPrompt({ identity?, environment?, appendSections? }) joins in a fixed order
types/         Public interfaces
  agent.ts       AgentContext, ModelContext, AgentOptions
  messages/      Block-based content: text, image_url, file (FileContent), thinking, tool_use, tool_result
                   Roles: system / user / assistant / tool
                   UserMessageContent = (text | image_url | file)[]  — FileContent aligns with Vercel AI SDK FilePart
                   AssistantMessage carries `usage`
  provider/      LLMProvider abstract (invoke + stream)
  middleware.ts  8 hooks: before|afterModel, before|afterAgentRun, before|afterAgentStep, before|afterToolUse
tools/         Registry + builtins
  tool.ts        defineTool(), FunctionTool, ToolContext (sandbox + abortSignal)
  builtins/      bash, read/write/strReplace, glob, grep, ls, webSearch, webFetch
middlewares/   Cross-cutting logic, folder-per-module
  loop-detection/  MD5 hash sliding window of (toolName+input); warn → shouldStop
  micro-compact/   Stub older tool_result content; keep N recent verbatim
  auto-compact/    Summary-based history compaction (onCompacted callback yields compacted summary msg)
  skills/          Load gray-matter frontmatter skills from disk
  todo/            createTodoSystem() → { tool: todo_write, middleware } — plan-scoped task tracking
sandbox/       Abstraction + impls, folder-local types
  types.ts       Sandbox interface (exec/readFile/writeFile/listDir/glob/grep) + result shapes
  local.ts       LocalSandbox (Node.js)
  index.ts       Re-exports
community/     Provider impls
  anthropic/     AnthropicProvider (OpenAI-compatible baseURL override supported)
index.ts       Public exports
```

## Streaming shape

`stream({ mode })` yields `AgentEvent`:
- `AgentPartialEvent` — partial assistant snapshot; each yield supersedes the last (replace by identity, never append). A tool_use block may carry partial/empty `input` until JSON is well-formed.
- `AgentMessageEvent` — completed assistant message or the tool message produced after local tool execution (ToolMessage is always atomic).

Stream ends naturally when the generator returns. `mode: "message"` skips partials. `invoke()` returns the final message array.

## Core abstractions

- **Agent** — stateful loop holding model, tools, middlewares, sandbox, messages.
- **LLMProvider** — abstract `invoke` + `stream`.
- **Tool** — Zod input schema + `invoke(input, ctx)`. `ctx` = `{ sandbox, abortSignal }`.
- **Middleware** — sequential hooks; return `Partial<AgentContext>` / `Partial<ModelContext>` / `Partial<AssistantMessage>` to merge mutations.
- **Sandbox** — injected at agent creation; all builtin tools route through it.

## createAgent defaults

`createAgent({ model, sandbox, tools?, middlewares?, skillsDirs?, initMessages?, prompt?, maxSteps? })`:
- Builtin tools (bash/read/write/strReplace/glob/grep/ls + todo_write) are prepended; `tools` override by name.
- Middlewares auto-wired in order: `createSkillsMiddleware(skillsDirs)` → `todoSystem.middleware` → `loopDetectionMiddleware()` → ...user middlewares.
- `skillsDirs` defaults to `[~/.agents/skills]`; pass `[]` to disable.
- `prompt` defaults to `composeSystemPrompt()` — the full 7-section identity+behavior prompt. Override with your own string, or call `composeSystemPrompt({ identity, environment, appendSections })` to swap the identity paragraph / bolt an environment section on.

## Conventions

- **Cooperative stop**: middlewares set `agentContext.shouldStop` to exit cleanly after current step — never throw to stop.
- **Block-based content everywhere** — never concat strings; always polymorphic blocks.
- **Folder-per-module** for middlewares/tools. Classes only for heavy stateful logic (Agent).
- **YAGNI**: minimal constructors, per-call options over config.

## Tech

Bun + TS. `@anthropic-ai/sdk`, `openai` (baseURL override path), `@modelcontextprotocol/sdk`, `zod`, `gray-matter`.

## Relationship

Consumed by `@code-artisan/backend`, which injects `E2BSandbox`, adds quota + file-tracker middlewares, swaps in its own `bash`/`bash_output`/`kill_shell`/`expose_port` tools (PTY-backed long-running processes), and pipes `agent.stream()` into SSE. The system prompt is built by `composeSystemPrompt({ identity: WEB_IDENTITY, environment: buildEnvironmentSection(...) })` on the backend side. The message model is unified — backend persists JSONB that mirrors these shapes and rebuilds them via a bridge function that expands `metadata.attachments` into `image_url` / `file` blocks at run-time.
