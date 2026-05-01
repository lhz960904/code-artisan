import type { Message, UserMessage, UserMessageContent } from "@code-artisan/agent";
import type { Attachment, SelectedElement } from "@code-artisan/shared";
import { getPublicUrl } from "../services/storage";

/**
 * Build a user message for persistence. Attachments + selected element stay
 * in metadata — the agent-facing expansion (image_url / FileContent / element
 * context block) is performed fresh by buildAgentMessages on every run, so
 * the stored shape never duplicates file bytes or context into content.
 */
export function buildUserMessage(
  content: string,
  attachments: Attachment[],
  selectedElement?: SelectedElement,
): UserMessage {
  return {
    role: "user",
    content: [{ type: "text", text: content }],
    metadata: { attachments, selectedElement },
  };
}

function formatSelectedElementBlock(element: SelectedElement): string {
  const lines = [
    "<selected_element>",
    `tag: ${element.tagName}`,
    `selector: ${element.selector}`,
    `text: ${element.textContent || "(empty)"}`,
    element.nearestUniqueText ? `nearest_unique_text: ${element.nearestUniqueText}` : null,
    `current_route: ${element.pathname}`,
    "</selected_element>",
    "",
    "<source_locating_instructions>",
    "The user picked the element above from the live preview and wants changes scoped to it.",
    "1. Locate the source: grep the codebase for `nearest_unique_text` first — it's the most reliable signature. Fall back to grepping for the className combination from `selector`.",
    "2. Verify by reading the matched file before editing — make sure the element you found really is the one the user picked.",
    "3. Modify ONLY this element. Do not change other elements that look similar.",
    "</source_locating_instructions>",
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
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
    const selectedElement = stored.metadata?.selectedElement as SelectedElement | undefined;
    const content: UserMessageContent = [];

    if (selectedElement) {
      content.push({ type: "text", text: formatSelectedElementBlock(selectedElement) });
    }
    content.push(...stored.content);

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
