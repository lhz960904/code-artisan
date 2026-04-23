import {
  Agent,
  AgentMiddleware,
  AnthropicProvider,
  autoCompactMiddleware,
  createAgent,
  Message,
  microCompactMiddleware,
  UserMessage,
  webFetchTool,
  webSearchTool,
} from "@code-artisan/agent";
import type { NonSystemMessage, StoredMessage, WebAgentEvent } from "@code-artisan/shared";
import { buildWebSystemPrompt } from "../prompts";
import type { E2BSandbox } from "../sandbox/e2b-sandbox";
import { db } from "../db";
import { conversations, fileSnapshots, messages } from "../db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { acquireConversationSandbox } from "./conversation-sandbox";
import { randomUUID } from "node:crypto";
import { buildAgentMessages } from "../utils/message";
import { checkQuotaMiddleware } from "./middlewares/check-quota";
import { fileTrackerMiddleware } from "./middlewares/track-file-changes";
import { generateTitleMiddleware } from "./middlewares/generate-title";
import { getShellSessionManager } from "./shell-session";
import { createWebBashTool, createBashOutputTool, createKillShellTool, createExposePortTool } from "./web-tools";

type Conversation = typeof conversations.$inferSelect;

export interface AgentTurnOptions {
  model: string;
}

export class AgentTurnService {
  private agent: Agent | null = null;

  private pendingEvents: WebAgentEvent[] = [];

  constructor(
    private conversation: Conversation,
    private turnOptions: AgentTurnOptions,
  ) {}

  async *run(userMessage: UserMessage): AsyncGenerator<WebAgentEvent> {
    const [userMessageId, resumeMessages, sandboxResult] = await Promise.all([
      this._insertMessage(userMessage),
      this._buildAgentMessages(),
      this._setupSandbox(),
    ]);

    const [expandedUserMessage] = buildAgentMessages([userMessage]);

    yield { type: "user_message_saved", messageId: userMessageId };

    if (!this.agent) {
      this.agent = this._buildAgent(resumeMessages, sandboxResult.sandbox, sandboxResult.initialFiles);
    }

    // Shared id across this turn's partial + message events.
    let assistantMessageId: string | null = null;

    for await (const event of this.agent.stream(expandedUserMessage as UserMessage)) {
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
    // Drain any events pushed after the last agent yield (e.g. quota_exceeded)
    while (this.pendingEvents.length > 0) {
      yield this.pendingEvents.shift()!;
    }
  }

  private _buildAgent(resumeMessages: Message[], sandbox: E2BSandbox, initialFiles: Map<string, string> | null): Agent {
    const provider = new AnthropicProvider(this.turnOptions.model, {
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
      // auto-generate conversation title from first user message (skipped if title already set)
      generateTitleMiddleware({
        conversation: this.conversation,
        onTitleReady: (title: string) => {
          this.pendingEvents.push({ type: "title_update", title });
        },
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
      prompt: buildWebSystemPrompt(),
      initMessages: resumeMessages as NonSystemMessage[],
      middlewares,
      // TODO: how to integration mcp tools and skills, if need to put in sandbox?
      tools: [
        createWebBashTool({ conversationId: this.conversation.id, manager: getShellSessionManager() }),
        createBashOutputTool({ manager: getShellSessionManager() }),
        createKillShellTool({ manager: getShellSessionManager() }),
        createExposePortTool({ manager: getShellSessionManager() }),
        webSearchTool,
        webFetchTool,
      ],
      skillsDirs: [],
    });
  }

  private async _setupSandbox(): Promise<{ sandbox: E2BSandbox; initialFiles: Map<string, string> | null }> {
    const { sandbox, snapshots } = await acquireConversationSandbox(this.conversation.id, this.conversation.sandboxId);
    const initialFiles: Map<string, string> | null =
      snapshots.length > 0 ? new Map(snapshots.map((s) => [s.path, s.content])) : null;
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
        metadata: message.metadata ?? null,
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

    return buildAgentMessages(stored as Message[]);
  }
}
