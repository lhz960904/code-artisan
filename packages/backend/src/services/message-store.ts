import { db } from "../db/index.js";
import { messages, fileSnapshots } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import type {
  Message,
  MessageRole,
  MessagePart,
  ToolCallPart,
} from "@code-artisan/shared";

export class MessageStore {
  constructor(private conversationId: string) {}

  // --- Message CRUD ---

  async addMessage(
    role: MessageRole,
    parts: MessagePart[],
    metadata?: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const [row] = await db
      .insert(messages)
      .values({
        conversationId: this.conversationId,
        role,
        parts: parts as unknown as Record<string, unknown>[],
        metadata: metadata as Record<string, unknown>,
      })
      .returning({ id: messages.id });
    return row;
  }

  async getMessages(): Promise<Message[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, this.conversationId))
      .orderBy(messages.createdAt);

    return rows.map((r) => ({
      id: r.id,
      role: r.role as MessageRole,
      parts: r.parts as unknown as MessagePart[],
      metadata: (r.metadata as Record<string, unknown>) ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Update a specific part within a message (e.g. tool-call state progression) */
  async updatePart(
    messageId: string,
    partIndex: number,
    updates: Partial<ToolCallPart>,
  ): Promise<void> {
    const entries = Object.entries(updates).filter(([key]) => key !== "type");
    if (entries.length === 0) return;

    // Nest jsonb_set calls: jsonb_set(jsonb_set(parts, ...), ...)
    let expr = "parts";
    for (const [key, value] of entries) {
      const jsonPath = `{${partIndex},${key}}`;
      expr = `jsonb_set(${expr}, '${jsonPath}', '${JSON.stringify(value)}'::jsonb)`;
    }

    await db.execute(
      sql.raw(`UPDATE messages SET parts = ${expr} WHERE id = '${messageId}'`),
    );
  }

  // --- File Snapshots ---

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
