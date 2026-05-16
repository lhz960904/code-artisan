import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { deployments } from "../db/schema.js";

@Injectable()
export class DeploymentRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listByConversationId(conversationId: string) {
    return this.db
      .select()
      .from(deployments)
      .where(eq(deployments.conversationId, conversationId))
      .orderBy(desc(deployments.createdAt));
  }
}
