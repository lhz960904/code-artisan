import type { Sandbox } from "./base";

/**
 * Abstract sandbox provider — manages sandbox lifecycle (create/reuse/release).
 */
export interface SandboxProvider {
  /** Acquire a sandbox (create new or reconnect to existing). */
  acquire(sandboxId?: string): Promise<Sandbox>;

  /** Get an existing sandbox by ID, or null if not found. */
  get(sandboxId: string): Sandbox | null;

  /** Release a sandbox (close and remove from pool). */
  release(sandboxId: string): Promise<void>;

  /** Shutdown all active sandboxes. */
  shutdown(): Promise<void>;
}
