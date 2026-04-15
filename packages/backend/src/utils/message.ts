import type { Message, UserMessage, UserMessageContent } from "@code-artisan/agent";
import type { Attachment, StoredMessage } from "@code-artisan/shared";
import { getFileBuffer, getPublicUrl } from "../services/storage";

export async function buildUserMessage(content: string, attachments: Attachment[]): Promise<UserMessage> {
  const message: StoredMessage = {
    id: "",
    conversationId: "",
    createdAt: new Date().toISOString(),
    role: "user",
    content: [{ type: "text", text: content }],
    metadata: { attachments: attachments },
  };
  return (await buildAgentMessages([message]))[0] as UserMessage;
}

export async function buildAgentMessages(storedMessage: StoredMessage[]): Promise<Message[]> {
  const result: Message[] = [];

  for (const msg of storedMessage) {
    const message = {
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata,
    } as Message;

    // attachments to message
    if (msg.role === "user") {
      const attachments = (msg.metadata?.attachments || []) as Attachment[];
      for (const att of attachments) {
        const content: UserMessageContent = msg.content;
        if (att.mimeType.startsWith("image/")) {
          content.push({
            type: "image_url",
            image_url: { url: getPublicUrl(att.fileId) },
          });
        } else {
          // default to text
          try {
            const buf = await getFileBuffer(att.fileId);
            const body = new TextDecoder().decode(buf);
            content.push({ type: "text", text: `File: ${att.fileName}]\nContent:${body}` });
          } catch {
            content.push({
              type: "text",
              text: `File: ${att.fileName}]\nContent: failed to load`,
            });
          }
        }
      }
    }

    result.push(message);
  }

  return result;
}
