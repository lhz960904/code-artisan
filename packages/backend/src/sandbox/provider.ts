import type { Sandbox } from "./types.js";
import { E2BSandbox } from "./e2b-sandbox.js";

/**
 * Abstract sandbox provider interface.
 */
export interface SandboxProvider {
  /** Acquire a sandbox (create or reconnect), return the instance. */
  acquire(sandboxId?: string): Promise<Sandbox>;

  /** Get an existing sandbox by ID. */
  get(sandboxId: string): Sandbox | null;

  /** Release a sandbox. */
  release(sandboxId: string): Promise<void>;
}

export class E2BProvider implements SandboxProvider {
  private sandboxes = new Map<string, E2BSandbox>();

  async acquire(sandboxId?: string): Promise<Sandbox> {
    // Try reconnecting to an existing sandbox
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

    // Create a new sandbox
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

  /** Restore file snapshots into a sandbox. */
  async restoreFiles(sandbox: Sandbox, snapshots: Array<{ path: string; content: string }>): Promise<void> {
    for (const { path, content } of snapshots) {
      await sandbox.writeFile(path, content);
    }
  }

  /** Shutdown all active sandboxes. */
  async shutdown(): Promise<void> {
    const ids = [...this.sandboxes.keys()];
    await Promise.allSettled(ids.map((id) => this.release(id)));
  }
}

// --- Singleton management (aligned with DeerFlow) ---

let _provider: E2BProvider | null = null;

export function getSandboxProvider(): E2BProvider {
  if (!_provider) {
    _provider = new E2BProvider();
  }
  return _provider;
}

export function resetSandboxProvider(): void {
  _provider = null;
}

export async function shutdownSandboxProvider(): Promise<void> {
  if (_provider) {
    await _provider.shutdown();
    _provider = null;
  }
}
