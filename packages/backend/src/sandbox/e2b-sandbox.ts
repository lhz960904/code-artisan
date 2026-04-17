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

const DEFAULT_EXEC_TIMEOUT_MS = 30_000;
const DEFAULT_SANDBOX_LIFETIME_MS = 10 * 60 * 1000;
const LIST_DIR_LIMIT = 500;
const GREP_MAX_LINES = 500;
const GLOB_MAX_FILES = 500;

export class E2BSandbox implements Sandbox {
  readonly sdk: E2BSDK;

  constructor(sdk: E2BSDK) {
    this.sdk = sdk;
  }

  get sandboxId(): string {
    return this.sdk.sandboxId;
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    const result = await this.sdk.commands.run(command, {
      cwd: options?.cwd,
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

  /** Create a fresh E2B sandbox. */
  static async create(timeoutMs: number = DEFAULT_SANDBOX_LIFETIME_MS): Promise<E2BSandbox> {
    const sdk = await E2BSDK.create({ timeoutMs });
    return new E2BSandbox(sdk);
  }

  /** Reconnect to an existing E2B sandbox by ID. */
  static async connect(sandboxId: string): Promise<E2BSandbox> {
    const sdk = await E2BSDK.connect(sandboxId);
    return new E2BSandbox(sdk);
  }
}

export { DEFAULT_SANDBOX_LIFETIME_MS };
