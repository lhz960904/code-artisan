import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { messages } from "../db/schema.js";

@Injectable()
export class MessageRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listByConversationId(conversationId: string) {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  }
}
