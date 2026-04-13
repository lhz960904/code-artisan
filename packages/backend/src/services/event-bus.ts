import { EventEmitter } from "events";
import type { AgentSseEvent } from "@code-artisan/shared";

/**
 * In-process pub/sub for agent SSE events, keyed by conversationId.
 * Runners publish; route handlers subscribe per SSE connection.
 */
class ConversationEventBus {
  private emitters = new Map<string, EventEmitter>();

  private getEmitter(conversationId: string): EventEmitter {
    let emitter = this.emitters.get(conversationId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(20);
      this.emitters.set(conversationId, emitter);
    }
    return emitter;
  }

  emit(conversationId: string, event: AgentSseEvent): void {
    this.getEmitter(conversationId).emit("event", event);
  }

  subscribe(
    conversationId: string,
    handler: (event: AgentSseEvent) => void,
  ): () => void {
    const emitter = this.getEmitter(conversationId);
    emitter.on("event", handler);
    return () => {
      emitter.off("event", handler);
      if (emitter.listenerCount("event") === 0) {
        this.emitters.delete(conversationId);
      }
    };
  }
}

export const eventBus = new ConversationEventBus();
