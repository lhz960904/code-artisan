import {
  Agent,
  AgentEvent,
  AgentMiddleware,
  AnthropicProvider,
  autoCompactMiddleware,
  createAgent,
  LocalSandbox,
  loopDetectionMiddleware,
  Message,
  microCompactMiddleware,
  Sandbox,
  UserMessage,
} from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import type { NonSystemMessage, StoredMessage, WebAgentEvent } from "@code-artisan/shared";
import { getSandboxPool } from "../sandbox";
import { db } from "../db";
import { conversations, fileSnapshots, messages } from "../db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { buildAgentMessages } from "../utils/message";
import { checkQuotaMiddleware } from "./middlewares/check-quota";
import { fileTrackerMiddleware } from "./middlewares/track-file-changes";

type Conversation = typeof conversations.$inferSelect;

export class AgentTurnService {
  private agent: Agent | null = null;

  private pendingEvents: WebAgentEvent[] = [];

  constructor(private conversation: Conversation) {}

  async *run(userMessage: UserMessage): AsyncGenerator<WebAgentEvent> {
    const [userMessageId, resumeMessages, sandboxResult] = await Promise.all([
      this._insertMessage(userMessage),
      this._buildAgentMessages(),
      this._setupSandbox(),
    ]);

    yield { type: "user_message_saved", messageId: userMessageId };

    if (!this.agent) {
      this.agent = this._buildAgent(resumeMessages, sandboxResult.sandbox, sandboxResult.initialFiles);
    }

    // Shared id across this turn's partial + message events.
    let assistantMessageId: string | null = null;

    for await (const event of this.agent.stream(userMessage)) {
      while (this.pendingEvents.length > 0) {
        yield this.pendingEvents.shift()!;
      }

      if (event.type === "partial") {
        if (!assistantMessageId) assistantMessageId = randomUUID();
        yield { ...event, messageId: assistantMessageId };
        continue;
      }

      const isAssistant = event.message.role === "assistant";
      const messageId = isAssistant && assistantMessageId ? assistantMessageId : randomUUID();
      await this._insertMessage(event.message, messageId);
      yield { ...event, messageId };
      if (isAssistant) assistantMessageId = null;
    }
    this.pendingEvents = [];
  }

  private _buildAgent(resumeMessages: Message[], sandbox: Sandbox, initialFiles: Map<string, string> | null): Agent {
    const provider = new AnthropicProvider("minimax-m2.5", {
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL,
    });

    const middlewares: AgentMiddleware[] = [
      microCompactMiddleware(),
      autoCompactMiddleware({
        onCompacted: async ([summaryUser]) => {
          // next agent run messages started with compacted summary
          await this._insertMessage({ ...summaryUser, metadata: { ...summaryUser.metadata, compacted: true } });
        },
      }),
      // check quota exceeded
      checkQuotaMiddleware(this.conversation.userId, () => {
        this.pendingEvents.push({ type: "quota_exceeded" });
      }),
      // track file mutations (write tools + bash); stream to web + persist
      fileTrackerMiddleware({
        sandbox,
        initialManifest: initialFiles ?? undefined,
        onFileChanged: (files) => {
          this.pendingEvents.push({ type: "file_update", files });
        },
        onFileDeleted: (paths) => {
          this.pendingEvents.push({ type: "file_delete", paths });
        },
        onPersist: (manifest) => this._persistFileSnapshots(manifest),
      }),
    ];

    return createAgent({
      model: provider,
      sandbox: sandbox,
      prompt: [
        `You are a helpful coding assistant operating inside an isolated sandbox.`,
        `Your project workspace is at \`${SANDBOX_WORKSPACE_ROOT}\`. Treat it as the root of the user's project — all source files, configs, and generated artefacts belong under it.`,
        `When tools require paths, prefer absolute paths rooted at \`${SANDBOX_WORKSPACE_ROOT}\` (e.g. \`${SANDBOX_WORKSPACE_ROOT}/src/index.ts\`). Run shell commands with cwd set to \`${SANDBOX_WORKSPACE_ROOT}\` unless the task clearly requires otherwise.`,
        `Do not read or write files outside \`${SANDBOX_WORKSPACE_ROOT}\` (e.g. dotfiles in /home/user, system paths) — they are invisible to the user and won't be persisted.`,
      ].join("\n\n"),
      initMessages: resumeMessages as NonSystemMessage[],
      middlewares,
      // TODO: how to integration mcp tools and skills, if need to put in sandbox?
      tools: [],
      skillsDirs: [],
    });
  }

  private async _setupSandbox(): Promise<{ sandbox: Sandbox; initialFiles: Map<string, string> | null }> {
    const pool = getSandboxPool();
    const [sandbox, snapshots] = await Promise.all([
      pool.acquire(this.conversation.sandboxId ?? undefined),
      db.select().from(fileSnapshots).where(eq(fileSnapshots.conversationId, this.conversation.id)),
    ]);

    const initialFiles: Map<string, string> | null =
      snapshots.length > 0 ? new Map(snapshots.map((s) => [s.path, s.content])) : null;

    if (sandbox.sandboxId !== this.conversation.sandboxId) {
      // New sandbox: ensure the workspace exists (idempotent) before
      // writing snapshots or letting the agent scan it.
      try {
        await sandbox.exec(`mkdir -p ${SANDBOX_WORKSPACE_ROOT}`);
      } catch (error) {
        console.error(`[AgentTurnService] mkdir workspace failed:`, error);
      }
      if (snapshots.length > 0) {
        try {
          await sandbox.sdk.files.write(snapshots.map((s) => ({ path: s.path, data: s.content })));
        } catch (error) {
          console.error(`[AgentTurnService] batch snapshot restore failed:`, error);
        }
      }
      await db
        .update(conversations)
        .set({ sandboxId: sandbox.sandboxId })
        .where(eq(conversations.id, this.conversation.id));
    }

    return { sandbox, initialFiles };
  }

  /** Insert a message to db; returns the row id (caller may supply one to pre-bind). */
  private async _insertMessage(message: Message, id?: string): Promise<string> {
    const [row] = await db
      .insert(messages)
      .values({
        ...(id ? { id } : {}),
        conversationId: this.conversation.id,
        role: message.role,
        content: message.content,
      })
      .returning({ id: messages.id });
    return row.id;
  }

  /**
   * Replace this conversation's snapshots with the given manifest:
   * upsert every entry, then delete any DB rows whose path is no longer present.
   */
  private async _persistFileSnapshots(manifest: Map<string, string>): Promise<void> {
    for (const [path, content] of manifest) {
      await db
        .insert(fileSnapshots)
        .values({ conversationId: this.conversation.id, path, content })
        .onConflictDoUpdate({
          target: [fileSnapshots.conversationId, fileSnapshots.path],
          set: { content, updatedAt: new Date() },
        });
    }
    const keepPaths = Array.from(manifest.keys());
    if (keepPaths.length > 0) {
      await db
        .delete(fileSnapshots)
        .where(and(eq(fileSnapshots.conversationId, this.conversation.id), notInArray(fileSnapshots.path, keepPaths)));
    } else {
      await db.delete(fileSnapshots).where(eq(fileSnapshots.conversationId, this.conversation.id));
    }
  }

  /** Build agent messages from db */
  private async _buildAgentMessages(): Promise<Message[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, this.conversation.id))
      .orderBy(messages.createdAt);

    const stored = rows.map((r) => {
      const base = {
        id: r.id,
        conversationId: r.conversationId,
        createdAt: r.createdAt.toISOString(),
        metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
      };
      return {
        ...base,
        role: r.role,
        content: r.content,
      } as StoredMessage;
    });

    return buildAgentMessages(stored);
  }
}
