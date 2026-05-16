import { Injectable } from "@nestjs/common";
import type { Cancelable } from "./cancelable.js";

interface Entry {
  runner: Cancelable;
  startedAt: number;
}

// Tracks active agent turns keyed by conversation id so /message/:id/stop can
// signal cancel without holding a reference itself.
@Injectable()
export class AgentRunnerRegistryService {
  private readonly runners = new Map<string, Entry>();

  register(conversationId: string, runner: Cancelable): void {
    this.runners.set(conversationId, { runner, startedAt: Date.now() });
  }

  // Remove only when the stored entry still points to this runner — a newer
  // turn that overwrote this slot must not be evicted by an old turn's finally.
  unregister(conversationId: string, runner: Cancelable): void {
    const entry = this.runners.get(conversationId);
    if (entry && entry.runner === runner) {
      this.runners.delete(conversationId);
    }
  }

  stop(conversationId: string, reason?: unknown): boolean {
    const entry = this.runners.get(conversationId);
    if (!entry) return false;
    entry.runner.cancel(reason);
    return true;
  }

  has(conversationId: string): boolean {
    return this.runners.has(conversationId);
  }
}
