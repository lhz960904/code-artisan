import type { Message, UserMessage, UserMessageContent } from "@code-artisan/agent";
import type { Attachment } from "@code-artisan/shared";
import { getPublicUrl } from "../services/storage";

/**
 * Build a user message for persistence. Attachments stay in metadata — the
 * agent-facing expansion (image_url / FileContent) is performed fresh by
 * buildAgentMessages on every run, so the stored shape never duplicates
 * file bytes into content.
 */
export function buildUserMessage(content: string, attachments: Attachment[]): UserMessage {
  return {
    role: "user",
    content: [{ type: "text", text: content }],
    metadata: { attachments },
  };
}

/**
 * Rehydrate stored messages into the shape the agent SDK expects. For user
 * messages we expand `metadata.attachments` into additional content blocks
 * without mutating the input. Each attachment becomes an `image_url` block
 * (images) or a `file` block (everything else) — the provider decides how
 * to encode FileContent based on its native capabilities.
 */
export function buildAgentMessages(storedMessages: Message[]): Message[] {
  const result: Message[] = [];

  for (const stored of storedMessages) {
    if (stored.role !== "user") {
      result.push(stored);
      continue;
    }

    const attachments = (stored.metadata?.attachments ?? []) as Attachment[];
    const content: UserMessageContent = [...stored.content];

    for (const attachment of attachments) {
      if (attachment.mimeType.startsWith("image/")) {
        content.push({ type: "image_url", image_url: { url: getPublicUrl(attachment.fileId) } });
      } else {
        content.push({
          type: "file",
          data: new URL(getPublicUrl(attachment.fileId)),
          mediaType: attachment.mimeType,
          filename: attachment.fileName,
        });
      }
    }

    result.push({ role: "user", content, metadata: stored.metadata });
  }

  return result;
}
