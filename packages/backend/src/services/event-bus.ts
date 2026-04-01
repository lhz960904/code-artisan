import { EventEmitter } from "events";
import type { MessageStreamEvent } from "@code-artisan/shared";

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

  emitStream(conversationId: string, data: MessageStreamEvent): void {
    this.getEmitter(conversationId).emit("stream", data);
  }

  subscribe(
    conversationId: string,
    handler: (data: MessageStreamEvent) => void,
  ): () => void {
    const emitter = this.getEmitter(conversationId);
    emitter.on("stream", handler);
    return () => {
      emitter.off("stream", handler);
      if (emitter.listenerCount("stream") === 0) {
        this.emitters.delete(conversationId);
      }
    };
  }
}

export const eventBus = new ConversationEventBus();
