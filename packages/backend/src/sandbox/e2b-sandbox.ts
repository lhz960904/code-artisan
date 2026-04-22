/**
 * E2B Sandbox implementation of @code-artisan/agent's Sandbox interface.
 * Passed into the agent via `createAgent({ sandbox })`.
 *
 * Pattern B: agent loop runs server-side, tool calls are dispatched
 * to E2B microVMs via the SDK.
 */
import { Sandbox as E2BSDK, FileType } from "@e2b/code-interpreter";
import type { CommandHandle as E2BCommandHandle } from "@e2b/code-interpreter";
import type {
  Sandbox,
  ExecOptions,
  ExecResult,
  SpawnOptions,
  ProcessHandle,
  WriteFileOptions,
  FileEntry,
  GlobResult,
  GrepResult,
} from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";

// 5 minutes covers npm install, builds, and other long one-shot commands.
const DEFAULT_EXEC_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_SANDBOX_LIFETIME_MS = 10 * 60 * 1000;
const LIST_DIR_LIMIT = 500;
const GREP_MAX_LINES = 500;
const GLOB_MAX_FILES = 500;

export class E2BSandbox implements Sandbox {
  readonly sdk: E2BSDK;

  /** Fires inside `spawn()` whenever a background process starts. Set by
   *  `AgentTurnService` to fan the handle's stdout/stderr into SSE events. */
  onProcessStart?: (handle: ProcessHandle, command: string) => void;

  constructor(sdk: E2BSDK) {
    this.sdk = sdk;
  }

  get sandboxId(): string {
    return this.sdk.sandboxId;
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    // Default cwd to the project workspace so AI-issued commands (npm install,
    // ls, cat src/...) land where files live, without needing `cd` everywhere.
    const result = await this.sdk.commands.run(command, {
      cwd: options?.cwd ?? SANDBOX_WORKSPACE_ROOT,
      timeoutMs: options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async spawn(command: string, options?: SpawnOptions): Promise<ProcessHandle> {
    const stdoutQueue = new StreamQueue<string>();
    const stderrQueue = new StreamQueue<string>();

    const handle = await this.sdk.commands.run(command, {
      cwd: options?.cwd ?? SANDBOX_WORKSPACE_ROOT,
      background: true,
      onStdout: (data) => stdoutQueue.push(data),
      onStderr: (data) => stderrQueue.push(data),
    });

    // Close queues once the process terminates so their AsyncIterables end.
    handle.wait().catch(() => undefined).finally(() => {
      stdoutQueue.close();
      stderrQueue.close();
    });

    const wrapped = new E2BProcessHandle(handle, stdoutQueue, stderrQueue, this.sdk);
    this.onProcessStart?.(wrapped, command);
    return wrapped;
  }

  async readFile(path: string): Promise<string> {
    return this.sdk.files.read(path);
  }

  async writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void> {
    if (options?.append) {
      const existing = await this.sdk.files.read(path).catch(() => "");
      await this.sdk.files.write(path, existing + content);
    } else {
      await this.sdk.files.write(path, content);
    }
  }

  async listDir(path: string): Promise<FileEntry[]> {
    // E2B's files.list has a `depth` option — 2 matches agent's ls semantics.
    const entries = await this.sdk.files.list(path, { depth: 2 });
    const results: FileEntry[] = [];
    const prefix = path.endsWith("/") ? path : `${path}/`;

    for (const e of entries) {
      if (results.length >= LIST_DIR_LIMIT) break;
      const rel = e.path.startsWith(prefix) ? e.path.slice(prefix.length) : e.name;
      results.push({ path: rel, is_dir: e.type === FileType.DIR });
    }
    return results;
  }

  async glob(pattern: string, path: string): Promise<GlobResult> {
    // Simple glob: match filename pattern recursively under `path`.
    // Path-prefix patterns (e.g. "src/**/*.ts") are approximated by the
    // basename (*.ts) — if finer control is needed, use the bash tool.
    // Only files are returned; directories come from listDir.
    try {
      const basename = pattern.split("/").pop() || pattern;
      const escaped = basename.replace(/'/g, "'\\''");
      const cmd = `find ${path} -type f -name '${escaped}' 2>/dev/null | head -${GLOB_MAX_FILES}`;
      const result = await this.sdk.commands.run(cmd, { timeoutMs: 10_000 });
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const files = result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => ({
          path: line.startsWith(prefix) ? line.slice(prefix.length) : line,
          is_dir: false,
        }));
      return { files };
    } catch (err) {
      return { files: [], error: String(err) };
    }
  }

  async grep(pattern: string, path: string, include?: string): Promise<GrepResult> {
    try {
      const escapedPattern = pattern.replace(/'/g, "'\\''");
      const includeArg = include ? `--include='${include}'` : "";
      const cmd = `grep -rn --fixed-strings ${includeArg} '${escapedPattern}' ${path} 2>/dev/null | head -${GREP_MAX_LINES}`;
      const result = await this.sdk.commands.run(cmd, { timeoutMs: 10_000 });
      const lines = result.stdout.split("\n").filter(Boolean);

      const prefix = path.endsWith("/") ? path : `${path}/`;
      const matches = lines.flatMap((line) => {
        const firstColon = line.indexOf(":");
        const secondColon = line.indexOf(":", firstColon + 1);
        if (firstColon < 0 || secondColon < 0) return [];
        const filePath = line.slice(0, firstColon);
        const lineNum = Number.parseInt(line.slice(firstColon + 1, secondColon), 10);
        const text = line.slice(secondColon + 1);
        const relativePath = filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
        return [{ path: relativePath, line: lineNum, text }];
      });
      return { matches };
    } catch (err) {
      return { matches: [], error: String(err) };
    }
  }

  /** Extend the sandbox's idle-kill timer. Resets from now, not additive. */
  async setTimeout(timeoutMs: number): Promise<void> {
    await this.sdk.setTimeout(timeoutMs);
  }

  /** Create a fresh E2B sandbox with the project workspace pre-created. */
  static async create(timeoutMs: number = DEFAULT_SANDBOX_LIFETIME_MS): Promise<E2BSandbox> {
    const sdk = await E2BSDK.create({ timeoutMs });
    // Ensure workspaceRoot exists before any exec uses it as default cwd.
    // Using files.makeDir (not exec) avoids the chicken-and-egg with default cwd.
    try {
      await sdk.files.makeDir(SANDBOX_WORKSPACE_ROOT);
    } catch (err) {
      console.error("[E2BSandbox] makeDir workspace failed:", err);
    }
    return new E2BSandbox(sdk);
  }

  /** Reconnect to an existing E2B sandbox by ID. */
  static async connect(sandboxId: string): Promise<E2BSandbox> {
    const sdk = await E2BSDK.connect(sandboxId);
    return new E2BSandbox(sdk);
  }
}

export { DEFAULT_SANDBOX_LIFETIME_MS };

class E2BProcessHandle implements ProcessHandle {
  readonly pid: number;
  readonly stdout: AsyncIterable<string>;
  readonly stderr: AsyncIterable<string>;

  constructor(
    private handle: E2BCommandHandle,
    stdoutQueue: StreamQueue<string>,
    stderrQueue: StreamQueue<string>,
    private sdk: E2BSDK,
  ) {
    this.pid = handle.pid;
    this.stdout = { [Symbol.asyncIterator]: () => stdoutQueue.iterator() };
    this.stderr = { [Symbol.asyncIterator]: () => stderrQueue.iterator() };
  }

  async wait(): Promise<number> {
    try {
      const result = await this.handle.wait();
      return result.exitCode ?? 0;
    } catch (err) {
      // CommandExitError carries the exit code on non-zero termination.
      const code = (err as { exitCode?: number }).exitCode;
      if (typeof code === "number") return code;
      throw err;
    }
  }

  isAlive(): boolean {
    return this.handle.exitCode === undefined;
  }

  async kill(_signal?: "SIGTERM" | "SIGKILL"): Promise<void> {
    // E2B only supports SIGKILL; signal arg is accepted for API symmetry.
    await this.handle.kill();
  }

  async exposePort(port: number): Promise<string> {
    return this.sdk.getHost(port);
  }
}

/** Minimal async queue: `push` from producers, iterate as AsyncGenerator,
 *  `close` to signal end-of-stream. Used to bridge E2B's callback-based
 *  stdout/stderr API into our AsyncIterable ProcessHandle shape. */
class StreamQueue<T> {
  private values: T[] = [];
  private pending: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) return;
    const resolver = this.pending.shift();
    if (resolver) resolver({ value, done: false });
    else this.values.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.pending.length > 0) {
      this.pending.shift()!({ value: undefined as unknown as T, done: true });
    }
  }

  async *iterator(): AsyncGenerator<T> {
    while (true) {
      if (this.values.length > 0) {
        yield this.values.shift()!;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<T>>((resolve) => {
        this.pending.push(resolve);
      });
      if (result.done) return;
      yield result.value;
    }
  }
}
