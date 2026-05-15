import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { ConversationSettings } from "@code-artisan/shared";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { conversations, fileSnapshots, messages } from "../db/schema.js";

export interface ConversationUpdatePatch {
  title?: string;
  settings?: ConversationSettings;
}

export interface ShareSlugUpdate {
  shareSlug: string;
  sharedAt: Date;
}

@Injectable()
export class ConversationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(userId: string, title: string | null) {
    const [row] = await this.db
      .insert(conversations)
      .values({ userId, title })
      .returning();
    return row;
  }

  async listByUser(userId: string) {
    return this.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  }

  async findOwnedById(userId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    return row ?? null;
  }

  async updateOwned(userId: string, id: string, patch: ConversationUpdatePatch) {
    const [row] = await this.db
      .update(conversations)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.settings !== undefined ? { settings: patch.settings } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning();
    return row;
  }

  async setShareSlug(userId: string, id: string, share: ShareSlugUpdate) {
    const [row] = await this.db
      .update(conversations)
      .set({ shareSlug: share.shareSlug, sharedAt: share.sharedAt, updatedAt: share.sharedAt })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning({ shareSlug: conversations.shareSlug, sharedAt: conversations.sharedAt });
    return row;
  }

  async clearShareSlug(userId: string, id: string) {
    await this.db
      .update(conversations)
      .set({ shareSlug: null, sharedAt: null, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  }

  // Schema lacks DB-level cascade for messages/fileSnapshots — clean manually before the parent row.
  async removeWithCascade(id: string) {
    await this.db.delete(messages).where(eq(messages.conversationId, id));
    await this.db.delete(fileSnapshots).where(eq(fileSnapshots.conversationId, id));
    await this.db.delete(conversations).where(eq(conversations.id, id));
  }
}
