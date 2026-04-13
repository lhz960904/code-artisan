import { E2BSandbox } from "./e2b-sandbox.js";

/**
 * Per-conversation E2B sandbox pool.
 *
 * - `acquire(existingId?)` tries to reconnect to an existing E2B
 *   sandbox; falls back to creating a fresh one.
 * - `release(id)` closes and removes the sandbox from the pool.
 * - `shutdown()` closes all sandboxes (call on server stop).
 */
export class E2BSandboxPool {
  private sandboxes = new Map<string, E2BSandbox>();

  async acquire(existingId?: string): Promise<E2BSandbox> {
    if (existingId) {
      const cached = this.sandboxes.get(existingId);
      if (cached) return cached;

      try {
        const reconnected = await E2BSandbox.connect(existingId);
        this.sandboxes.set(reconnected.sandboxId, reconnected);
        return reconnected;
      } catch {
        // Sandbox expired / unreachable — fall through to create.
      }
    }
    const fresh = await E2BSandbox.create();
    this.sandboxes.set(fresh.sandboxId, fresh);
    return fresh;
  }

  get(sandboxId: string): E2BSandbox | null {
    return this.sandboxes.get(sandboxId) ?? null;
  }

  async release(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return;
    try {
      await sandbox.sdk.kill();
    } catch (err) {
      console.error(`[sandbox] release ${sandboxId} error:`, err);
    }
    this.sandboxes.delete(sandboxId);
  }

  async shutdown(): Promise<void> {
    const ids = [...this.sandboxes.keys()];
    await Promise.allSettled(ids.map((id) => this.release(id)));
  }
}

// ---- singleton ----

let _pool: E2BSandboxPool | null = null;

export function getSandboxPool(): E2BSandboxPool {
  if (!_pool) _pool = new E2BSandboxPool();
  return _pool;
}

export async function shutdownSandboxPool(): Promise<void> {
  if (_pool) {
    await _pool.shutdown();
    _pool = null;
  }
}
