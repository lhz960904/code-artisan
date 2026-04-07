import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  Sandbox,
  ExecOptions,
  WriteFileOptions,
  GlobResult,
  GrepResult,
} from "../base";

export interface LocalSandboxOptions {
  /** Working directory for command execution. Defaults to process.cwd(). */
  cwd?: string;
  /** Timeout for command execution in ms. Defaults to 30000. */
  timeoutMs?: number;
}

async function shellExec(
  command: string,
  options: { cwd: string; timeoutMs: number },
): Promise<string> {
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => proc.kill(), options.timeoutMs);

  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // For grep, exit code 1 means no matches (not an error)
      if (exitCode === 1 && !stderr) {
        return stdout;
      }
      throw new Error(stderr || `Process exited with code ${exitCode}`);
    }

    return stdout;
  } finally {
    clearTimeout(timeout);
  }
}

export class LocalSandbox implements Sandbox {
  readonly id: string;
  private cwd: string;
  private timeoutMs: number;

  constructor(options?: LocalSandboxOptions) {
    this.id = crypto.randomUUID();
    this.cwd = options?.cwd ?? process.cwd();
    this.timeoutMs = options?.timeoutMs ?? 30_000;
  }

  async exec(command: string, options?: ExecOptions): Promise<string> {
    if (options?.background) {
      shellExec(`${command} &`, { cwd: this.cwd, timeoutMs: this.timeoutMs });
      return "";
    }
    return shellExec(command, { cwd: this.cwd, timeoutMs: this.timeoutMs });
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

  async listDir(path: string): Promise<string[]> {
    const output = await shellExec(
      `find ${path} -maxdepth 2 \\( -type f -o -type d \\) 2>/dev/null | head -500`,
      { cwd: this.cwd, timeoutMs: 10_000 },
    );
    return output.split("\n").filter(Boolean);
  }

  async glob(pattern: string, path: string): Promise<GlobResult> {
    try {
      const output = await shellExec(
        `find ${path} -name '${pattern}' 2>/dev/null | head -500`,
        { cwd: this.cwd, timeoutMs: 10_000 },
      );
      const lines = output.split("\n").filter(Boolean);

      const files = await Promise.all(
        lines.map(async (line) => {
          const s = await stat(line).catch(() => null);
          const relativePath = line.startsWith(path)
            ? line.slice(path.length).replace(/^\//, "")
            : line;
          return {
            path: relativePath,
            is_dir: s?.isDirectory() ?? false,
          };
        }),
      );

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
      const output = await shellExec(
        `grep -rn --fixed-strings ${includeArg} '${escapedPattern}' ${path} 2>/dev/null | head -500`,
        { cwd: this.cwd, timeoutMs: 10_000 },
      );
      const lines = output.split("\n").filter(Boolean);

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

  async close(): Promise<void> {
    // Local sandbox has no resources to clean up
  }
}
