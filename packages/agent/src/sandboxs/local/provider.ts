import type { Sandbox } from "../base";
import type { SandboxProvider } from "../provider";
import { LocalSandbox, type LocalSandboxOptions } from "./index";

export class LocalProvider implements SandboxProvider {
  private sandboxes = new Map<string, LocalSandbox>();
  private options?: LocalSandboxOptions;

  constructor(options?: LocalSandboxOptions) {
    this.options = options;
  }

  async acquire(sandboxId?: string): Promise<Sandbox> {
    if (sandboxId) {
      const cached = this.sandboxes.get(sandboxId);
      if (cached) return cached;
    }

    const sandbox = new LocalSandbox(this.options);
    this.sandboxes.set(sandbox.id, sandbox);
    return sandbox;
  }

  get(sandboxId: string): Sandbox | null {
    return this.sandboxes.get(sandboxId) ?? null;
  }

  async release(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) {
      await sandbox.close();
      this.sandboxes.delete(sandboxId);
    }
  }

  async shutdown(): Promise<void> {
    const ids = [...this.sandboxes.keys()];
    await Promise.allSettled(ids.map((id) => this.release(id)));
  }
}
