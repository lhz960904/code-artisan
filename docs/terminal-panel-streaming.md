# Terminal Panel Streaming — Long-Running Process + Live Output

**Date:** 2026-04-22
**TODO items merged:** 4× "Sandbox 长驻进程" + 1× "workspace terminal panel UI 交互优化"

## Problem

The workspace `TerminalPanel` is wired up but never populated — `appendTerminal` has no callers. The agent's `bash` tool runs via `sandbox.exec()`, a single blocking call with a 30s timeout, so long-running commands (dev servers, watchers) can't even complete, let alone stream output. Users watching a Bolt-style preview workflow see nothing in the terminal while the agent sets up a project.

## Goal

Live-stream output from long-running commands (primarily `npm run dev`-style dev servers) into the xterm panel, character-by-character, matching the bolt.new UX shown in the reference screenshot. Short bash commands stay unchanged — their output remains in the tool-call expansion in chat, not the terminal.

## Non-Goals

- Persisting terminal scrollback across page reloads (bolt.new doesn't; xterm's in-memory scrollback is enough for one session).
- Replaying chunks produced while no SSE is open (user-idle periods). The process keeps running in the sandbox; its stdout between turns is lost for UI purposes. Dev-server noise during idle chat is not load-bearing.
- Multiple tabs (Publish Output, user-interactive Terminal). Single `Preview Server` tab for v1.
- A separate `StartServer` tool. Follows Claude Code's pattern: one `bash` tool with a `run_in_background` flag.
- Interactive stdin to the backgrounded process.
- Killing a backgrounded process from the UI. (Agent can do it via bash.)
- Process health UI (isAlive indicator, exit-code badges beyond a terminal line).

## Architecture

Three layers, minimal cross-layer changes:

### Layer 1: `@code-artisan/agent` — environment-agnostic primitives

Extend `Sandbox` with a new `spawn()` method returning a `ProcessHandle`. Keep the agent loop, middleware, message shapes, `ToolContext`, and `AgentOptions` untouched. The agent SDK exposes `spawn` as a pure primitive and stays unaware of who listens for process lifecycle events — that responsibility lives in the concrete sandbox implementation (Layer 2).

```ts
// packages/agent/sandbox/types.ts
export interface Sandbox {
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  spawn(command: string, options?: SpawnOptions): Promise<ProcessHandle>;  // NEW
  readFile(...)
  writeFile(...)
  listDir(...)
  glob(...)
  grep(...)
}

export interface SpawnOptions {
  cwd?: string;
}

export interface ProcessHandle {
  readonly pid: number;
  /** AsyncIterable of stdout chunks as strings. Ends when process exits. */
  stdout: AsyncIterable<string>;
  /** AsyncIterable of stderr chunks as strings. Ends when process exits. */
  stderr: AsyncIterable<string>;
  /** Resolves to exit code when process terminates. */
  wait(): Promise<number>;
  /** Check liveness without blocking. */
  isAlive(): boolean;
  /** Terminate the process. */
  kill(signal?: "SIGTERM" | "SIGKILL"): Promise<void>;
  /** Map a port in the sandbox to a public URL. Only meaningful on remote sandboxes (E2B). */
  exposePort(port: number): Promise<string>;
}
```

Extend the `bash` builtin tool with `run_in_background: boolean` (default false):

```ts
// packages/agent/tools/builtins/bash.ts
parameters: z.object({
  description: z.string().describe("..."),
  command: z.string().describe("..."),
  run_in_background: z.boolean().optional().default(false)
    .describe("Start the command in the background and return immediately. Use for long-running processes (dev servers, watchers, tails). Do NOT use for one-shot commands where you need the output — those should run foreground."),
})

invoke: async ({ command, run_in_background }, ctx) => {
  if (run_in_background) {
    const handle = await ctx.sandbox.spawn(command);
    return `Started in background. PID: ${handle.pid}.`;
  }
  // Existing foreground path, unchanged.
  const { stdout, stderr, exitCode } = await ctx.sandbox.exec(command);
  ...
}
```

The bash tool does **not** know about any listener. It just calls `sandbox.spawn()` and reports the PID back to the LLM. Broadcasting the new handle to observers is handled inside the concrete sandbox implementation. `ToolContext` and `AgentOptions` get no new fields — zero UX coupling in the agent SDK.

### Layer 2: `@code-artisan/backend` — sandbox hook + SSE events

**`E2BSandbox.spawn()`** uses E2B's native `sdk.commands.run(cmd, { background: true })`, which returns a `CommandHandle` that's not awaited. Wrap that in our `ProcessHandle` shape. `exposePort` maps to `sdk.getHost(port)`.

The concrete sandbox itself owns the "spawn happened" hook. This is backend-specific (the agent SDK's `Sandbox` interface has nothing like it):

```ts
// packages/backend/src/sandbox/e2b-sandbox.ts
export class E2BSandbox implements Sandbox {
  /** Hook fired whenever spawn() creates a new process. Set by AgentTurnService to stream chunks over SSE. */
  onProcessStart?: (handle: ProcessHandle, command: string) => void;

  async spawn(command: string, options?: SpawnOptions): Promise<ProcessHandle> {
    const handle = /* ...wrap sdk.commands.run(cmd, { background: true })... */;
    this.onProcessStart?.(handle, command);
    return handle;
  }
}
```

**`LocalSandbox.spawn()`** uses `Bun.spawn()` with pipe stdout/stderr. stdout/stderr streams via `ReadableStream` → async iterable of decoded strings. `exposePort` throws (local sandbox has no public URL). Local sandbox does *not* need the hook today — CLI/TUI can add one analogously if it ever wants live streaming.

**`AgentTurnService.run()`** sets the hook on the concrete sandbox before building the agent:

```ts
const { sandbox } = await this._setupSandbox();  // returns E2BSandbox
sandbox.onProcessStart = (handle, command) => {
  const terminalId = randomUUID();
  this.pendingEvents.push({ type: "terminal_start", id: terminalId, command });
  // Fan stdout + stderr into SSE chunks.
  (async () => {
    for await (const chunk of handle.stdout) {
      this.pendingEvents.push({ type: "terminal_chunk", id: terminalId, stream: "stdout", data: chunk });
    }
  })();
  (async () => {
    for await (const chunk of handle.stderr) {
      this.pendingEvents.push({ type: "terminal_chunk", id: terminalId, stream: "stderr", data: chunk });
    }
  })();
  handle.wait().then((exitCode) => {
    this.pendingEvents.push({ type: "terminal_exit", id: terminalId, exitCode });
  });
};

this.agent = createAgent({ sandbox, ... });  // sandbox widens to Sandbox interface
```

The sandbox is acquired from the pool with concrete type `E2BSandbox`, so setting `onProcessStart` is type-safe. When passed to `createAgent`, it widens to the `Sandbox` interface, which has no knowledge of the hook.

Because the sandbox instance is reused across turns for the same conversation (via the pool), each new `AgentTurnService` instance overwrites `onProcessStart` before its turn runs. This is fine — turns are sequential per conversation; there's no overlap.

**`WebAgentEvent` union (shared/types.ts)** gets three new variants:

```ts
| { type: "terminal_start"; id: string; command: string }
| { type: "terminal_chunk"; id: string; stream: "stdout" | "stderr"; data: string }
| { type: "terminal_exit"; id: string; exitCode: number }
```

**Process survival across turns.** E2B background processes survive as long as the sandbox lives (the pool keeps the sandbox warm across turns). The `pendingEvents` push loop, however, is scoped to a single turn. Chunks produced between turns are silently dropped. Known limitation; documented as non-goal.

**No file-tracker changes.** `fileTrackerMiddleware` uses `sandbox.exec`, not `spawn`, so it's untouched. The `bash` tool's foreground path is also unchanged, so file tracking after short bash commands still works.

### Layer 3: `@code-artisan/frontend` — store + xterm streaming

**`stores/workspace.ts`** — replace `terminalHistory` with a streaming session model:

```ts
export interface TerminalSession {
  id: string;
  command: string;
  status: "running" | "exited";
  exitCode?: number;
}

interface WorkspaceState {
  terminalSessions: TerminalSession[];  // rename from terminalHistory
  ...
  startTerminalSession(id: string, command: string): void;
  exitTerminalSession(id: string, exitCode: number): void;
  // Chunks are written directly to xterm via an imperative handle — NOT stored in Zustand.
  // The store only tracks session metadata (for headers, status dots); xterm owns the scrollback.
  // This avoids re-rendering the terminal panel on every chunk.
}
```

**Key performance choice:** chunks do **not** live in Zustand state. They would cause React re-renders on every character. Instead, `TerminalPanel` exposes an imperative `writeChunk(id, stream, data)` via a module-level ref (or context), and `useChat` calls it directly on each `terminal_chunk` SSE event. The store only holds session metadata (id/command/status/exitCode) for any future header UI.

**`use-chat.ts`** — add three SSE branches:

```ts
case "terminal_start":
  useWorkspaceStore.getState().startTerminalSession(event.id, event.command);
  terminalPanelRef.current?.writeHeader(event.id, event.command);
  break;
case "terminal_chunk":
  terminalPanelRef.current?.writeChunk(event.id, event.stream, event.data);
  break;
case "terminal_exit":
  useWorkspaceStore.getState().exitTerminalSession(event.id, event.exitCode);
  terminalPanelRef.current?.writeExit(event.id, event.exitCode);
  break;
```

**`terminal-panel.tsx`** gains imperative methods exposed via `useImperativeHandle` on a ref, OR a module-level emitter the panel subscribes to. **Decision:** module-level emitter (mitt-style or simple EventTarget wrapper) — lives in `lib/terminal-bus.ts`. Simpler than threading refs through React tree. `useChat` publishes, `TerminalPanel` subscribes on mount and writes to its xterm instance. If the panel unmounts and remounts, missed chunks are lost — acceptable because panel is always mounted in `WorkspaceLayout`.

```ts
// packages/frontend/src/lib/terminal-bus.ts
type TerminalEvent =
  | { type: "start"; id: string; command: string }
  | { type: "chunk"; id: string; stream: "stdout" | "stderr"; data: string }
  | { type: "exit"; id: string; exitCode: number };

const listeners = new Set<(e: TerminalEvent) => void>();
export const terminalBus = {
  emit: (e: TerminalEvent) => listeners.forEach((l) => l(e)),
  subscribe: (l: (e: TerminalEvent) => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
```

Rendering rules in `TerminalPanel`:
- **`start`**: `term.writeln("\x1b[36m$ " + command + "\x1b[0m")` (cyan, distinct from the old green to match bolt's muted palette).
- **`chunk`**: `term.write(data)`. NO `writeln` — E2B chunks already contain embedded `\n` and partial-line boundaries. ANSI escapes pass through (npm install progress bars, vite color output).
- **`exit`**: only write a line if `exitCode !== 0` — show `\r\n\x1b[31m[process exited with code ${exitCode}]\x1b[0m\r\n`. Successful exits get no decoration (dev servers don't normally exit cleanly; watchers don't exit at all).

Conversation reset (`reset()` in workspace store) needs to clear `terminalSessions` AND call `term.clear()` on the xterm instance — add a `clear` event to the bus.

### Prompt guidance

Add to `AgentTurnService._buildAgent`'s prompt:

> When you need to run a long-running process (a dev server like `npm run dev`, a file watcher, or a tailing command), call `bash` with `run_in_background: true`. The command returns immediately with a PID; its output streams live to the user's terminal panel. Do NOT background one-shot commands — those should run foreground so you receive the output.

> After starting a dev server in the background, call `exposePort` via a follow-up bash command only if the user needs the public URL. (For v1: the `bash` tool result mentions PID but not URL — port exposure is manual via a future tool.)

Port auto-expose is **deferred** to a later iteration. V1 starts the server and streams logs; preview URL continues to come from existing backend logic (TBD check). If preview URL machinery needs spawn integration, fold it into a follow-up.

## Data flow summary

```
LLM calls bash(command="npm run dev", run_in_background=true)
  ↓
agent bash tool → sandbox.spawn(command)
  ↓
E2BSandbox.spawn(): wraps sdk.commands.run(..., {background:true}) → ProcessHandle
  ↓ (still inside spawn, before returning)
this.onProcessStart?.(handle, command)   [hook owned by E2BSandbox, set by AgentTurnService]
  ↓
AgentTurnService: push terminal_start → fan handle.stdout/stderr into terminal_chunk events → terminal_exit on wait()
  ↓
SSE → frontend useChat
  ↓
terminalBus.emit(...)
  ↓
TerminalPanel subscription → xterm.write(chunk)
```

Meanwhile the tool returns `"Started in background. PID: 1234."` to the LLM, which continues reasoning without blocking.

## Error handling

- `sandbox.spawn()` throws → bash tool returns `"Failed to start: <error>"`, same as exec failures today.
- `stdout`/`stderr` iterator throws mid-stream → log server-side, push a `terminal_chunk` with a red-colored `[stream error]` line, exit the fan loop.
- Frontend SSE reconnect (mid-turn network blip) → chunks during the gap are lost; acceptable.
- Process outlives turn → handle dangles in sandbox memory; next turn's agent can `bash` to check (`ps`, `kill`). No explicit tracking on the backend side beyond the sandbox itself.

## Testing

- **Agent SDK**: unit test `LocalSandbox.spawn()` with `echo` pipe (synchronous output), `sleep && echo` (delayed), and `sh -c "exit 1"` (non-zero exit). Verify `ProcessHandle.stdout` yields the expected chunks, `wait()` resolves, `kill()` terminates.
- **Agent SDK**: extend `bash` tool test — `run_in_background: true` calls `sandbox.spawn` (mock) exactly once and returns the PID string in the tool result.
- **Backend**: `E2BSandbox.spawn()` test — `onProcessStart` fires exactly once per spawn with the returned handle and the original command string.
- **Backend**: `AgentTurnService` integration test — feed a mock sandbox whose `spawn` yields 3 stdout chunks, assert the SSE event sequence is `terminal_start → 3× terminal_chunk → terminal_exit`.
- **Frontend**: unit test `terminalBus` emit/subscribe; manual smoke test for xterm streaming (hard to automate).

## Rollout

Single merge — all three layers land together. No feature flag; the existing `terminalHistory` field goes away as part of the store rename. Recent commits in the repo follow the same "whole-feature" merge cadence (see `f57a71b`, `44d095b`).

## Resolved decisions

1. **Port auto-expose** — out of v1. Heuristic port detection is messy; defer until there's a clear demand.
2. **Dev-server restart UX** — append. Two consecutive `run_in_background: true` calls produce two stacked sessions in the terminal, matching bolt.new's append-only model.
3. **Conversation switch** — `reset()` clears xterm. Old output from a different conversation is noise.
4. **Process-start hook placement** — owned by the concrete sandbox (`E2BSandbox.onProcessStart`), not by `AgentOptions` / `ToolContext`. Keeps the agent SDK fully UX-agnostic.
