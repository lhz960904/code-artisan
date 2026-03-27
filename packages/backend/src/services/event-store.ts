import { db } from "../db/index.js";
import { events, fileSnapshots } from "../db/schema.js";
import { eq, and, gt } from "drizzle-orm";
import type { AgentEventData } from "./agent.js";

export class EventStore {
  constructor(private conversationId: string) {}

  async writeEvent(type: string, data: AgentEventData): Promise<void> {
    await db.insert(events).values({
      conversationId: this.conversationId,
      type,
      data: data as Record<string, unknown>,
    });
  }

  async getEvents(afterSeq?: number): Promise<
    Array<{
      id: string;
      seq: number;
      type: string;
      data: unknown;
      createdAt: Date;
    }>
  > {
    const conditions = [eq(events.conversationId, this.conversationId)];
    if (afterSeq !== undefined) {
      conditions.push(gt(events.seq, afterSeq));
    }

    return db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(events.seq);
  }

  async upsertFileSnapshot(path: string, content: string): Promise<void> {
    await db
      .insert(fileSnapshots)
      .values({
        conversationId: this.conversationId,
        path,
        content,
      })
      .onConflictDoUpdate({
        target: [fileSnapshots.conversationId, fileSnapshots.path],
        set: { content, updatedAt: new Date() },
      });
  }

  async getFileSnapshots(): Promise<Array<{ path: string; content: string }>> {
    return db
      .select({ path: fileSnapshots.path, content: fileSnapshots.content })
      .from(fileSnapshots)
      .where(eq(fileSnapshots.conversationId, this.conversationId));
  }
}
