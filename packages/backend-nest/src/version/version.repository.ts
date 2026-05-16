import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { conversations, fileBlobs, versionFiles, versions } from "../db/schema.js";

@Injectable()
export class VersionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listByConversationId(conversationId: string) {
    return this.db
      .select({
        id: versions.id,
        parentVersionId: versions.parentVersionId,
        createdByMessageId: versions.createdByMessageId,
        label: versions.label,
        fileCount: versions.fileCount,
        totalBytes: versions.totalBytes,
        createdAt: versions.createdAt,
      })
      .from(versions)
      .where(eq(versions.conversationId, conversationId))
      .orderBy(asc(versions.createdAt));
  }

  // Verifies the version belongs to a conversation owned by `userId`. One join
  // proves both relationships without a second query.
  async findOwnedVersion(userId: string, conversationId: string, versionId: string) {
    const [row] = await this.db
      .select({ id: versions.id })
      .from(versions)
      .innerJoin(conversations, eq(versions.conversationId, conversations.id))
      .where(
        and(
          eq(versions.id, versionId),
          eq(versions.conversationId, conversationId),
          eq(conversations.userId, userId),
        ),
      );
    return row ?? null;
  }

  // Joins versionFiles → fileBlobs so callers see {path, content} without
  // dealing with content-addressed hashes.
  async listFilesByVersionId(versionId: string) {
    return this.db
      .select({ path: versionFiles.path, content: fileBlobs.content })
      .from(versionFiles)
      .innerJoin(fileBlobs, eq(versionFiles.blobHash, fileBlobs.hash))
      .where(eq(versionFiles.versionId, versionId));
  }
}
