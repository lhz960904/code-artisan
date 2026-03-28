import { EventEmitter } from "events";

export interface SSEEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  seq?: number;
}

class ConversationEventBus {
  private emitters = new Map<string, EventEmitter>();

  private getEmitter(conversationId: string): EventEmitter {
    if (!this.emitters.has(conversationId)) {
      const emitter = new EventEmitter();
      emitter.setMaxListeners(20);
      this.emitters.set(conversationId, emitter);
    }
    return this.emitters.get(conversationId)!;
  }

  emit(conversationId: string, event: SSEEvent): void {
    this.getEmitter(conversationId).emit("event", event);
  }

  subscribe(
    conversationId: string,
    handler: (event: SSEEvent) => void,
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

  emitDone(conversationId: string): void {
    this.emit(conversationId, { id: "done", type: "done", data: {} });
  }
}

export const eventBus = new ConversationEventBus();
