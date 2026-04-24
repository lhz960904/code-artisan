import type { AgentTurnService } from "./agent-turn";

interface Entry {
  service: AgentTurnService;
  startedAt: number;
}

class AgentRunnerRegistry {
  private runners = new Map<string, Entry>();

  register(conversationId: string, service: AgentTurnService): void {
    this.runners.set(conversationId, { service, startedAt: Date.now() });
  }

  /** Remove only if the stored entry still points to this service — a
   *  newer turn that overwrote this slot must not be evicted by an old
   *  turn's finally block. */
  unregister(conversationId: string, service: AgentTurnService): void {
    const entry = this.runners.get(conversationId);
    if (entry && entry.service === service) {
      this.runners.delete(conversationId);
    }
  }

  /** Ask the running service for this conversation to stop. Returns true
   *  when a running turn was found and signalled; false when idle. */
  stop(conversationId: string, reason?: unknown): boolean {
    const entry = this.runners.get(conversationId);
    if (!entry) return false;
    entry.service.cancel(reason);
    return true;
  }

  has(conversationId: string): boolean {
    return this.runners.has(conversationId);
  }
}

export const agentRunnerRegistry = new AgentRunnerRegistry();
