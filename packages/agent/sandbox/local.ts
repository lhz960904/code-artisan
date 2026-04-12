import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  Sandbox,
  ExecOptions,
  ExecResult,
  WriteFileOptions,
  FileEntry,
  GlobResult,
  GrepResult,
} from "./types";

export interface LocalSandboxOptions {
  /** Working directory for command execution. Defaults to process.cwd(). */
  cwd?: string;
  /** Default timeout for command execution in ms. Defaults to 30000. */
  timeoutMs?: number;
}

/**
 * LocalSandbox — executes commands and file ops directly on the host machine.
 * Used by the CLI and for development/testing.
 */
export class LocalSandbox implements Sandbox {
  private cwd: string;
  private timeoutMs: number;

  constructor(options?: LocalSandboxOptions) {
    this.cwd = options?.cwd ?? process.cwd();
    this.timeoutMs = options?.timeoutMs ?? 30_000;
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    const cwd = options?.cwd ?? this.cwd;
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;

    const proc = Bun.spawn(["bash", "-c", command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => proc.kill(), timeoutMs);
    try {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode };
    } finally {
      clearTimeout(timeout);
    }
  }

  async readFile(path: string): Promise<string> {
    return Bun.file(path).text();
  }

  async writeFile(
    path: string,
    content: string,
    options?: WriteFileOptions,
  ): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    if (options?.append) {
      const existing = await Bun.file(path).text().catch(() => "");
      await Bun.write(path, existing + content);
    } else {
      await Bun.write(path, content);
    }
  }

  async listDir(path: string): Promise<FileEntry[]> {
    const LIMIT = 500;
    const results: FileEntry[] = [];
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (results.length >= LIMIT) break;
      results.push({ path: e.name, is_dir: e.isDirectory() });
      if (e.isDirectory()) {
        const subs = await readdir(join(path, e.name), { withFileTypes: true }).catch(() => []);
        for (const s of subs) {
          if (results.length >= LIMIT) break;
          results.push({ path: join(e.name, s.name), is_dir: s.isDirectory() });
        }
      }
    }
    return results;
  }

  async glob(pattern: string, path: string): Promise<GlobResult> {
    try {
      const glob = new Bun.Glob(pattern);
      const files = [];
      for await (const rel of glob.scan({ cwd: path, dot: false })) {
        const s = await stat(join(path, rel)).catch(() => null);
        files.push({ path: rel, is_dir: s?.isDirectory() ?? false });
        if (files.length >= 1000) break; // safety cap; tool-level truncation is separate
      }
      return { files };
    } catch (err) {
      return { files: [], error: String(err) };
    }
  }

  async grep(
    pattern: string,
    path: string,
    include?: string,
  ): Promise<GrepResult> {
    try {
      const escapedPattern = pattern.replace(/'/g, "'\\''");
      const includeArg = include ? `--include='${include}'` : "";
      const result = await this.exec(
        `grep -rn --fixed-strings ${includeArg} '${escapedPattern}' ${path} 2>/dev/null | head -500`,
        { timeoutMs: 10_000 },
      );
      const lines = result.stdout.split("\n").filter(Boolean);

      const matches = lines.map((line) => {
        const firstColon = line.indexOf(":");
        const secondColon = line.indexOf(":", firstColon + 1);
        const filePath = line.slice(0, firstColon);
        const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
        const text = line.slice(secondColon + 1);
        const relativePath = filePath.startsWith(path)
          ? filePath.slice(path.length).replace(/^\//, "")
          : filePath;
        return { path: relativePath, line: lineNum, text };
      });

      return { matches };
    } catch (err) {
      return { matches: [], error: String(err) };
    }
  }
}
