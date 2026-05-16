import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { DEFAULT_SANDBOX_LIFETIME_MS, E2BSandbox } from "./e2b-sandbox.js";

// Per-conversation E2B sandbox pool.
// - acquire(existingId?): reconnect to an existing E2B sandbox; fall back to fresh.
// - release(id): close and remove.
// - onApplicationShutdown: close all sandboxes (called by Nest on stop).
@Injectable()
export class SandboxPoolService implements OnApplicationShutdown {
  private readonly logger = new Logger(SandboxPoolService.name);
  private readonly sandboxes = new Map<string, E2BSandbox>();
  // Dedupes concurrent reconnect-or-create attempts against the same id.
  private readonly inflight = new Map<string, Promise<E2BSandbox>>();

  async acquire(existingId?: string): Promise<E2BSandbox> {
    if (existingId) {
      const cached = this.sandboxes.get(existingId);
      if (cached) {
        try {
          await cached.setTimeout(DEFAULT_SANDBOX_LIFETIME_MS);
          return cached;
        } catch {
          this.sandboxes.delete(existingId);
        }
      }

      const inflight = this.inflight.get(existingId);
      if (inflight) return inflight;

      const promise = this.reconnectOrCreate(existingId).finally(() => {
        this.inflight.delete(existingId);
      });
      this.inflight.set(existingId, promise);
      return promise;
    }
    const fresh = await E2BSandbox.create();
    this.sandboxes.set(fresh.sandboxId, fresh);
    return fresh;
  }

  private async reconnectOrCreate(existingId: string): Promise<E2BSandbox> {
    try {
      const reconnected = await E2BSandbox.connect(existingId);
      await reconnected.setTimeout(DEFAULT_SANDBOX_LIFETIME_MS);
      this.sandboxes.set(reconnected.sandboxId, reconnected);
      return reconnected;
    } catch {
      // Sandbox expired / unreachable — fall through to create.
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
      this.logger.error(`release ${sandboxId} error: ${err instanceof Error ? err.message : err}`);
    }
    this.sandboxes.delete(sandboxId);
  }

  async onApplicationShutdown(): Promise<void> {
    const ids = [...this.sandboxes.keys()];
    await Promise.allSettled(ids.map((id) => this.release(id)));
  }
}
