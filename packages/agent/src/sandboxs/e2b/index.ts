import { Sandbox as E2BSandboxSDK } from "@e2b/code-interpreter";
import type {
  Sandbox,
  ExecOptions,
  WriteFileOptions,
  GlobResult,
  GrepResult,
} from "../base";

const IGNORE_DIRS = [
  "node_modules", ".git", "__pycache__", ".venv", "venv",
  "dist", "build", ".next", ".nuxt", ".turbo", ".cache",
  ".DS_Store", "*.egg-info", ".pytest_cache", ".mypy_cache",
  "coverage", ".nyc_output",
];

function buildExcludeArgs(dirs: string[]): string {
  return dirs
    .map((p) => `-not -path '*/${p}/*' -not -name '${p}'`)
    .join(" ");
}

export class E2BSandbox implements Sandbox {
  private sdk: E2BSandboxSDK;

  constructor(sdk: E2BSandboxSDK) {
    this.sdk = sdk;
  }

  get id(): string {
    return this.sdk.sandboxId;
  }

  async exec(command: string, options?: ExecOptions): Promise<string> {
    if (options?.background) {
      await this.sdk.commands.run(command, { background: true });
      return "";
    }
    const result = await this.sdk.commands.run(command, { timeoutMs: 30_000 });
    if (result.stderr) {
      return `${result.stdout}\n${result.stderr}`.trim();
    }
    return result.stdout;
  }

  async readFile(path: string): Promise<string> {
    return this.sdk.files.read(path);
  }

  async writeFile(
    path: string,
    content: string,
    options?: WriteFileOptions,
  ): Promise<void> {
    if (options?.append) {
      const existing = await this.readFile(path).catch(() => "");
      await this.sdk.files.write(path, existing + content);
    } else {
      await this.sdk.files.write(path, content);
    }
  }

  async listDir(path: string): Promise<string[]> {
    const excludes = buildExcludeArgs(IGNORE_DIRS);
    const cmd = `find ${path} -maxdepth 2 \\( -type f -o -type d \\) ${excludes} 2>/dev/null | head -500`;
    const result = await this.sdk.commands.run(cmd, { timeoutMs: 10_000 });
    return result.stdout.split("\n").filter(Boolean);
  }

  async glob(pattern: string, path: string): Promise<GlobResult> {
    try {
      const cmd = `find ${path} -name '${pattern}' ${buildExcludeArgs(IGNORE_DIRS)} 2>/dev/null | head -500`;
      const result = await this.sdk.commands.run(cmd, { timeoutMs: 10_000 });
      const lines = result.stdout.split("\n").filter(Boolean);

      // Use stat to check directories
      const files = await Promise.all(
        lines.map(async (line) => {
          const statResult = await this.sdk.commands.run(
            `test -d '${line}' && echo "dir" || echo "file"`,
            { timeoutMs: 5_000 },
          );
          const relativePath = line.startsWith(path)
            ? line.slice(path.length).replace(/^\//, "")
            : line;
          return {
            path: relativePath,
            is_dir: statResult.stdout.trim() === "dir",
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
      const cmd = `grep -rn --fixed-strings ${includeArg} '${escapedPattern}' ${path} 2>/dev/null | head -500`;
      const result = await this.sdk.commands.run(cmd, { timeoutMs: 10_000 });
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

  async close(): Promise<void> {
    await this.sdk.kill();
  }

  static async create(): Promise<E2BSandbox> {
    const sdk = await E2BSandboxSDK.create();
    return new E2BSandbox(sdk);
  }

  static async connect(sandboxId: string): Promise<E2BSandbox> {
    const sdk = await E2BSandboxSDK.connect(sandboxId);
    return new E2BSandbox(sdk);
  }
}
