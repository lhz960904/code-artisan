import type { Sandbox } from "../base";
import type { SandboxProvider } from "../provider";
import { E2BSandbox } from "./index";

export class E2BProvider implements SandboxProvider {
  private sandboxes = new Map<string, E2BSandbox>();

  async acquire(sandboxId?: string): Promise<Sandbox> {
    if (sandboxId) {
      const cached = this.sandboxes.get(sandboxId);
      if (cached) return cached;

      try {
        const sandbox = await E2BSandbox.connect(sandboxId);
        this.sandboxes.set(sandbox.id, sandbox);
        return sandbox;
      } catch {
        // Sandbox expired or unreachable, fall through to create
      }
    }

    const sandbox = await E2BSandbox.create();
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
