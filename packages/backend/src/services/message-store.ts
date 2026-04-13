import { db } from "../db/index.js";
import { messages, fileSnapshots } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type {
  Message,
  StoredMessage,
} from "@code-artisan/shared";

/**
 * Persistence layer for conversation messages and workspace file snapshots.
 *
 * Messages are stored in the agent-package shape directly — a row
 * carries `role` plus an opaque `content` (the role-specific content
 * array) plus optional metadata. Rows are append-only; tool-call
 * results arrive as separate `role: "tool"` rows.
 */
export class MessageStore {
  constructor(private conversationId: string) {}

  // --- Message CRUD ---

  /**
   * Append a new message. The row returns id + createdAt so the caller
   * can promote the in-memory Message into a StoredMessage and stream
   * it onward.
   */
  async addMessage(
    message: Message,
    metadata?: Record<string, unknown>,
  ): Promise<{ id: string; createdAt: string }> {
    const [row] = await db
      .insert(messages)
      .values({
        conversationId: this.conversationId,
        role: message.role,
        content: message.content as unknown as Record<string, unknown>[],
        metadata: metadata as Record<string, unknown> | undefined,
      })
      .returning({ id: messages.id, createdAt: messages.createdAt });
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getMessages(): Promise<StoredMessage[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, this.conversationId))
      .orderBy(messages.createdAt);

    return rows.map((r) => {
      const base = {
        id: r.id,
        conversationId: r.conversationId,
        createdAt: r.createdAt.toISOString(),
        metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
      };
      return {
        ...base,
        role: r.role,
        content: r.content,
      } as unknown as StoredMessage;
    });
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
