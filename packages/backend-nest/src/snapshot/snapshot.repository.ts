import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { fileSnapshots } from "../db/schema.js";

@Injectable()
export class SnapshotRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listByConversationId(conversationId: string) {
    return this.db
      .select({
        path: fileSnapshots.path,
        content: fileSnapshots.content,
        updatedAt: fileSnapshots.updatedAt,
      })
      .from(fileSnapshots)
      .where(eq(fileSnapshots.conversationId, conversationId));
  }
}
