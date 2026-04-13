import type {
  Message,
  ToolMessage,
  ToolUseContent,
  StoredMessage,
  Attachment,
  UserMessage,
  TextContent,
  ImageURLContent,
} from "@code-artisan/shared";
import { getFileBuffer, getPublicUrl } from "../services/storage.js";

const INTERRUPTED_OUTPUT =
  "Error: Tool execution was interrupted. Please retry if needed.";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "js", "ts", "jsx", "tsx", "py", "rb", "go", "rs",
  "java", "c", "cpp", "h", "hpp", "css", "html", "xml", "yaml", "yml",
  "toml", "ini", "cfg", "sh", "bash", "zsh", "sql", "graphql", "vue",
  "svelte", "astro", "env", "gitignore", "dockerignore", "makefile",
]);

function isTextLike(mimeType: string, fileName: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json" || mimeType === "application/xml") return true;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Build a user UserMessage from free-form text + uploaded attachments.
 *
 * Images resolve to public URLs (ImageURLContent); text-like documents
 * are read and inlined as TextContent with a "[File: <name>]" prefix;
 * binary documents (e.g. PDF) get a placeholder TextContent describing
 * the attachment, since the agent message format doesn't yet model
 * arbitrary document attachments.
 */
export async function buildUserMessage(
  text: string,
  attachments: Attachment[] = [],
): Promise<UserMessage> {
  const content: (TextContent | ImageURLContent)[] = [];

  for (const att of attachments) {
    if (att.mimeType.startsWith("image/")) {
      content.push({
        type: "image_url",
        image_url: { url: getPublicUrl(att.fileId) },
      });
      continue;
    }
    if (isTextLike(att.mimeType, att.fileName)) {
      try {
        const buf = await getFileBuffer(att.fileId);
        const body = new TextDecoder().decode(buf);
        content.push({ type: "text", text: `[File: ${att.fileName}]\n${body}` });
      } catch {
        content.push({
          type: "text",
          text: `[File: ${att.fileName} — failed to load]`,
        });
      }
      continue;
    }
    // Binary (PDF etc.) — placeholder; proper inline document support
    // requires extending the agent package's content types.
    content.push({
      type: "text",
      text: `[Attached file: ${att.fileName} (${att.mimeType}) — binary attachment inlining is not yet supported.]`,
    });
  }

  if (text.trim()) {
    content.push({ type: "text", text });
  }

  return { role: "user", content };
}

/**
 * Strip storage metadata from a StoredMessage to get the plain agent Message.
 */
function strip(msg: StoredMessage): Message {
  return {
    role: msg.role,
    content: msg.content,
  } as Message;
}

/**
 * Convert stored messages to the plain agent Message shape that
 * `agent.invoke()` expects, and fix any dangling tool_use entries.
 *
 * A tool_use "dangles" when an AssistantMessage's ToolUseContent has
 * no matching ToolResultContent in the next ToolMessage (e.g. the
 * previous run was interrupted between model turn and tool execution).
 * Anthropic rejects unpaired tool_use, so we synthesize an error
 * result so the model sees the interruption on resume.
 */
export function buildAgentMessages(stored: StoredMessage[]): Message[] {
  const out: Message[] = stored.map(strip);

  for (let i = 0; i < out.length; i++) {
    const msg = out[i]!;
    if (msg.role !== "assistant") continue;

    const toolUses = msg.content.filter(
      (c): c is ToolUseContent => c.type === "tool_use",
    );
    if (toolUses.length === 0) continue;

    // Collect all existing tool_results from contiguous following ToolMessages.
    const covered = new Set<string>();
    let j = i + 1;
    while (j < out.length && out[j]!.role === "tool") {
      for (const c of (out[j] as ToolMessage).content) {
        covered.add(c.tool_use_id);
      }
      j++;
    }

    const missing = toolUses.filter((tu) => !covered.has(tu.id));
    if (missing.length === 0) continue;

    // Insert a synthetic ToolMessage with error tool_results right
    // after the assistant message (before any real tool messages) so
    // pairing order stays valid.
    const synth: ToolMessage = {
      role: "tool",
      content: missing.map((tu) => ({
        type: "tool_result",
        tool_use_id: tu.id,
        content: INTERRUPTED_OUTPUT,
      })),
    };
    out.splice(i + 1, 0, synth);
  }

  return out;
}
