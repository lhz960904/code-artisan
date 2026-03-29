import { Sandbox as E2BSandboxSDK } from "@e2b/code-interpreter";
import type { Sandbox } from "./types.js";

export class E2BSandbox implements Sandbox {
  private sdk: E2BSandboxSDK;

  constructor(sdk: E2BSandboxSDK) {
    this.sdk = sdk;
  }

  get id(): string {
    return this.sdk.sandboxId;
  }

  async executeCommand(
    command: string,
    opts?: { background?: boolean },
  ): Promise<string> {
    if (opts?.background) {
      await this.sdk.commands.run(command, { background: true });
      return "";
    }
    const result = await this.sdk.commands.run(command, {
      timeoutMs: 30_000,
    });
    if (result.stderr) {
      return `${result.stdout}\n${result.stderr}`.trim();
    }
    return result.stdout;
  }

  async readFile(path: string): Promise<string> {
    return this.sdk.files.read(path);
  }

  async listDir(path: string, maxDepth = 2): Promise<string[]> {
    const ignores = [
      "node_modules", ".git", "__pycache__", ".venv", "venv",
      "dist", "build", ".next", ".nuxt", ".turbo", ".cache",
      ".DS_Store", "*.egg-info", ".pytest_cache", ".mypy_cache",
      "coverage", ".nyc_output",
    ];
    const excludes = ignores.map((p) => `-not -path '*/${p}/*' -not -name '${p}'`).join(" ");
    const cmd = `find ${path} -maxdepth ${maxDepth} \\( -type f -o -type d \\) ${excludes} 2>/dev/null | head -500`;
    const result = await this.sdk.commands.run(cmd, { timeoutMs: 10_000 });
    return result.stdout.split("\n").filter(Boolean);
  }

  async writeFile(
    path: string,
    content: string,
    append = false,
  ): Promise<void> {
    if (append) {
      const existing = await this.readFile(path).catch(() => "");
      await this.sdk.files.write(path, existing + content);
    } else {
      await this.sdk.files.write(path, content);
    }
  }

  getHostUrl(port: number): string {
    return `https://${this.sdk.getHost(port)}`;
  }

  async close(): Promise<void> {
    await this.sdk.kill();
  }

  /** Create a new E2B sandbox instance. */
  static async create(): Promise<E2BSandbox> {
    const sdk = await E2BSandboxSDK.create();
    return new E2BSandbox(sdk);
  }

  /** Reconnect to an existing E2B sandbox by ID. */
  static async connect(sandboxId: string): Promise<E2BSandbox> {
    const sdk = await E2BSandboxSDK.connect(sandboxId);
    return new E2BSandbox(sdk);
  }
}
