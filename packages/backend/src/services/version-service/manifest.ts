import { eq } from "drizzle-orm";

import { db } from "../../db";
import { conversations, fileBlobs, versionFiles, versions } from "../../db/schema";

export interface CreateVersionArgs {
  conversationId: string;
  parentVersionId: string | null;
  createdByMessageId: string | null;
  manifest: Map<string, string>;
  label?: string | null;
}

export interface CreateVersionResult {
  versionId: string;
  fileCount: number;
  totalBytes: number;
  newBlobCount: number;
}

interface PreparedEntry {
  path: string;
  content: string;
  hash: string;
  size: number;
}

export async function createVersionFromManifest(args: CreateVersionArgs): Promise<CreateVersionResult> {
  const entries = await Promise.all(
    Array.from(args.manifest.entries()).map(async ([path, content]) => {
      const { hash, size } = await hashAndSize(content);
      return { path, content, hash, size } satisfies PreparedEntry;
    }),
  );

  const fileCount = entries.length;
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);

  return await db.transaction(async (tx) => {
    let newBlobCount = 0;
    if (entries.length > 0) {
      const inserted = await tx
        .insert(fileBlobs)
        .values(entries.map((e) => ({ hash: e.hash, content: e.content, size: e.size })))
        .onConflictDoNothing()
        .returning({ hash: fileBlobs.hash });
      newBlobCount = inserted.length;
    }

    const [versionRow] = await tx
      .insert(versions)
      .values({
        conversationId: args.conversationId,
        parentVersionId: args.parentVersionId,
        createdByMessageId: args.createdByMessageId,
        label: args.label ?? null,
        fileCount,
        totalBytes,
      })
      .returning({ id: versions.id });

    if (entries.length > 0) {
      await tx
        .insert(versionFiles)
        .values(entries.map((e) => ({ versionId: versionRow.id, path: e.path, blobHash: e.hash })));
    }

    await tx
      .update(conversations)
      .set({ currentVersionId: versionRow.id, updatedAt: new Date() })
      .where(eq(conversations.id, args.conversationId));

    return { versionId: versionRow.id, fileCount, totalBytes, newBlobCount };
  });
}

async function hashAndSize(content: string): Promise<{ hash: string; size: number }> {
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { hash, size: encoded.length };
}
