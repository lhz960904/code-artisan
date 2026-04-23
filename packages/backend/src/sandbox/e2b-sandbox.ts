/**
 * E2B Sandbox implementation of @code-artisan/agent's Sandbox interface.
 * Passed into the agent via `createAgent({ sandbox })`.
 *
 * Pattern B: agent loop runs server-side, tool calls are dispatched
 * to E2B microVMs via the SDK.
 */
import { Sandbox as E2BSDK, FileType } from "@e2b/code-interpreter";
import type {
  Sandbox,
  ExecOptions,
  ExecResult,
  WriteFileOptions,
  FileEntry,
  GlobResult,
  GrepResult,
} from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";

const DEFAULT_EXEC_TIMEOUT_MS = 30_000;
const DEFAULT_SANDBOX_LIFETIME_MS = 10 * 60 * 1000;
/** Custom E2B template: extends code-interpreter with Bun + preloaded
 *  Skills at /opt/skills. See `sandbox/e2b.Dockerfile`. */
const E2B_TEMPLATE_NAME = "code-artisan";
/** E2B's `pty.create` default is 60s — way too short for an interactive shell
 *  or a dev server. Set to 1h, which is the max sandbox lifetime on Hobby
 *  accounts (Pro goes up to 24h); either way the sandbox's own idle-kill
 *  timer will terminate the PTY long before this upper bound fires.
 *
 *  Phase 2: a long-lived PTY (e.g. dev server across multiple agent turns)
 *  also needs the sandbox to be kept alive beyond 10min idle — see
 *  §8.1 in docs/shell-session-redesign.md for keepalive / pause-resume. */
const DEFAULT_PTY_TIMEOUT_MS = 60 * 60 * 1000;
const LIST_DIR_LIMIT = 500;
const GREP_MAX_LINES = 500;
const GLOB_MAX_FILES = 500;

export interface PtyHandle {
  readonly pid: number;
  sendInput(data: string): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  /** E2B only supports SIGKILL; signal arg accepted for API symmetry. */
  kill(signal?: "SIGTERM" | "SIGKILL"): Promise<void>;
  isAlive(): boolean;
  wait(): Promise<number>;
}

export interface PtyCreateOpts {
  cols: number;
  rows: number;
  cwd?: string;
  env?: Record<string, string>;
  onData: (data: string) => void;
  onExit?: (exitCode: number) => void;
}

export class E2BSandbox implements Sandbox {
  readonly sdk: E2BSDK;

  /** PTY namespace — backend-only API, not part of the agent `Sandbox` interface.
   *  Consumed by ShellSessionManager to back long-running shell sessions. */
  readonly pty = {
    create: (opts: PtyCreateOpts): Promise<PtyHandle> => this._createPty(opts),
  };

  constructor(sdk: E2BSDK) {
    this.sdk = sdk;
  }

  get sandboxId(): string {
    return this.sdk.sandboxId;
  }

  private async _createPty(opts: PtyCreateOpts): Promise<PtyHandle> {
    const decoder = new TextDecoder();
    const handle = await this.sdk.pty.create({
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd ?? SANDBOX_WORKSPACE_ROOT,
      envs: opts.env,
      timeoutMs: DEFAULT_PTY_TIMEOUT_MS,
      onData: (data) => opts.onData(decoder.decode(data, { stream: true })),
    });

    let alive = true;
    const exitPromise = handle
      .wait()
      .then((r) => {
        alive = false;
        const code = r.exitCode ?? 0;
        opts.onExit?.(code);
        return code;
      })
      .catch((err: unknown) => {
        alive = false;
        const code = (err as { exitCode?: number }).exitCode ?? -1;
        opts.onExit?.(code);
        return code;
      });

    const pid = handle.pid;
    const sdk = this.sdk;
    const encoder = new TextEncoder();

    return {
      pid,
      sendInput: (data: string) => sdk.pty.sendInput(pid, encoder.encode(data)),
      resize: (cols: number, rows: number) => sdk.pty.resize(pid, { cols, rows }),
      kill: async () => {
        await sdk.pty.kill(pid);
      },
      isAlive: () => alive,
      wait: () => exitPromise,
    };
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
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
    const sdk = await E2BSDK.create(E2B_TEMPLATE_NAME, { timeoutMs });
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
