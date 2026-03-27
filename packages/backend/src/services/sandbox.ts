import { Sandbox } from "@e2b/code-interpreter";

export class SandboxService {
  private constructor(private sandbox: Sandbox) {}

  static async create(): Promise<SandboxService> {
    const sandbox = await Sandbox.create();
    return new SandboxService(sandbox);
  }

  static async reconnect(sandboxId: string): Promise<SandboxService> {
    const sandbox = await Sandbox.connect(sandboxId);
    return new SandboxService(sandbox);
  }

  get id(): string {
    return this.sandbox.sandboxId;
  }

  async executeCommand(
    command: string,
  ): Promise<{ output: string; error?: string }> {
    const result = await this.sandbox.commands.run(command);
    return {
      output: result.stdout,
      error: result.stderr || undefined,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.sandbox.files.write(path, content);
  }

  async readFile(path: string): Promise<string> {
    const content = await this.sandbox.files.read(path);
    return content;
  }

  async listFiles(path: string): Promise<string[]> {
    const entries = await this.sandbox.files.list(path);
    return entries.map((e) => e.name);
  }

  async restoreFiles(
    snapshots: Array<{ path: string; content: string }>,
  ): Promise<void> {
    for (const { path, content } of snapshots) {
      await this.writeFile(path, content);
    }
  }

  async close(): Promise<void> {
    await this.sandbox.kill();
  }
}
