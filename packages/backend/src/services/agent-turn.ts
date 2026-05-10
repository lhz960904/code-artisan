import {
  Agent,
  AgentMiddleware,
  autoCompactMiddleware,
  createAgent,
  FunctionTool,
  Message,
  microCompactMiddleware,
  UserMessage,
  webFetchTool,
  webSearchTool,
} from "@code-artisan/agent";
import { createModelProvider } from "./model-provider";
import type { ConversationSettings, NonSystemMessage, StoredMessage, WebAgentEvent } from "@code-artisan/shared";
import { buildWebSystemPrompt } from "../prompts";
import type { E2BSandbox } from "../sandbox/e2b-sandbox";
import { db } from "../db";
import { conversations, fileSnapshots, messages, versions } from "../db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { acquireConversationSandbox } from "./conversation-sandbox";
import { getStoredSupabaseToken } from "./integration/supabase-client";
import { maybeBootstrapDevServer } from "./dev-server/bootstrap";
import { randomUUID } from "node:crypto";
import { buildAgentMessages } from "../utils/message";
import { checkQuotaMiddleware } from "./middlewares/check-quota";
import { fileTrackerMiddleware } from "./middlewares/track-file-changes";
import { getShellSessionManager } from "./shell-session";
import {
  createWebBashTool,
  createBashOutputTool,
  createKillShellTool,
  createExposePortTool,
  createSupabaseCreateProjectTool,
  createSupabaseSqlTool,
} from "./web-tools";
import { agentRunnerRegistry } from "./agent-runner-registry";
import { McpToolSet } from "../mcp/mcp-tools";
import { getInstalledMcpServers } from "../mcp/registry";
import { computeActiveChain, createVersionFromManifest } from "./version-service";

type Conversation = typeof conversations.$inferSelect;

export interface AgentTurnOptions {
  model: string;
}

export class AgentTurnService {
  private agent: Agent | null = null;

  private pendingEvents: WebAgentEvent[] = [];

  private mcpToolSet: McpToolSet | null = null;

  private currentTurnUserMessageId: string | null = null;

  constructor(
    private conversation: Conversation,
    private turnOptions: AgentTurnOptions,
  ) {}

  /** Ask the current agent run to stop. No-op when idle. */
  cancel(reason: unknown = "user_interrupted"): void {
    this.agent?.abort(reason);
  }

  async *run(userMessage: UserMessage): AsyncGenerator<WebAgentEvent> {
    const [userMessageId, resumeMessages, sandboxResult, mcpTools, supabaseConnected] = await Promise.all([
      this._insertMessage(userMessage),
      this._buildAgentMessages(),
      this._setupSandbox(),
      this._setupMcpTools(),
      this._loadSupabaseConnectionState(),
    ]);

    this.currentTurnUserMessageId = userMessageId;

    const [expandedUserMessage] = buildAgentMessages([userMessage]);

    yield { type: "user_message_saved", messageId: userMessageId };

    if (!this.agent) {
      this.agent = this._buildAgent(
        resumeMessages,
        sandboxResult.sandbox,
        sandboxResult.initialFiles,
        mcpTools,
        supabaseConnected,
      );
    }

    // Shared id across this turn's partial + message events.
    let assistantMessageId: string | null = null;

    agentRunnerRegistry.register(this.conversation.id, this);
    try {
      for await (const event of this.agent.stream(expandedUserMessage as UserMessage)) {
        while (this.pendingEvents.length > 0) {
          yield this.pendingEvents.shift()!;
        }

        if (event.type === "partial") {
          if (!assistantMessageId) assistantMessageId = randomUUID();
          yield { ...event, messageId: assistantMessageId };
          continue;
        }

        if (event.type === "interrupted") {
          yield event;
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
    } finally {
      agentRunnerRegistry.unregister(this.conversation.id, this);
      if (this.mcpToolSet) {
        await this.mcpToolSet.close().catch((err) => console.error("[mcp] close error:", err));
        this.mcpToolSet = null;
      }

      // Post-turn bootstrap: covers the new-conversation path (manifest just
      // written this turn). Idempotent — already-bootstrapped sandboxes no-op.
      void maybeBootstrapDevServer({
        sandbox: sandboxResult.sandbox,
        conversationId: this.conversation.id,
        manager: getShellSessionManager(),
      }).catch((err) => console.error("[agent-turn] bootstrap dev server failed:", err));
    }
  }

  private _buildAgent(
    resumeMessages: Message[],
    sandbox: E2BSandbox,
    initialFiles: Map<string, string> | null,
    mcpTools: FunctionTool[],
    supabaseConnected: boolean,
  ): Agent {
    const provider = createModelProvider(this.turnOptions.model);

    const middlewares: AgentMiddleware[] = [
      microCompactMiddleware(),
      autoCompactMiddleware({
        onCompacted: async ([summaryUser]) => {
          // next agent run messages started with compacted summary
          await this._insertMessage({ ...summaryUser, metadata: { ...summaryUser.metadata, compacted: true } });
        },
      }),
      // check quota exceeded
      checkQuotaMiddleware(this.conversation.userId, this.turnOptions.model, () => {
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
        onPersist: (manifest) => this._persistFileState(manifest),
      }),
    ];

    const settings = (this.conversation.settings as ConversationSettings | null) ?? {};

    const tools: FunctionTool[] = [
      createWebBashTool({ conversationId: this.conversation.id, manager: getShellSessionManager() }),
      createBashOutputTool({ manager: getShellSessionManager() }),
      createKillShellTool({ manager: getShellSessionManager() }),
      createExposePortTool({ conversationId: this.conversation.id, manager: getShellSessionManager() }),
      webSearchTool,
      webFetchTool,
      ...mcpTools,
    ];
    if (supabaseConnected) {
      tools.push(
        createSupabaseCreateProjectTool({ userId: this.conversation.userId, conversationId: this.conversation.id }),
        createSupabaseSqlTool({ userId: this.conversation.userId, conversationId: this.conversation.id }),
      );
    }

    return createAgent({
      model: provider,
      sandbox: sandbox,
      prompt: buildWebSystemPrompt({ supabaseConnected, userSystemPrompt: settings.systemPrompt }),
      initMessages: resumeMessages as NonSystemMessage[],
      middlewares,
      tools,
      skillsDirs: ["/opt/skills"],
    });
  }

  private async _loadSupabaseConnectionState(): Promise<boolean> {
    const stored = await getStoredSupabaseToken(this.conversation.userId);
    return Boolean(stored?.org_id);
  }

  private async _setupSandbox(): Promise<{ sandbox: E2BSandbox; initialFiles: Map<string, string> | null }> {
    const { sandbox, snapshots } = await acquireConversationSandbox(this.conversation.id, this.conversation.sandboxId);
    const initialFiles: Map<string, string> | null =
      snapshots.length > 0 ? new Map(snapshots.map((s) => [s.path, s.content])) : null;
    return { sandbox, initialFiles };
  }

  private async _setupMcpTools(): Promise<FunctionTool[]> {
    const configs = await getInstalledMcpServers(this.conversation.userId);
    if (configs.length === 0) return [];
    this.mcpToolSet = new McpToolSet();
    return this.mcpToolSet.initialize(configs);
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

  // Phase 1 shadow write: version path failure must never block fileSnapshots — the
  // latter is the live cold-start cache that the rest of the system still depends on.
  private async _persistFileState(manifest: Map<string, string>): Promise<void> {
    await Promise.all([
      this._persistFileSnapshots(manifest),
      this._persistVersion(manifest).catch((err) => {
        console.error("[agent-turn] shadow version write failed:", err);
      }),
    ]);
  }

  private async _persistVersion(manifest: Map<string, string>): Promise<void> {
    await createVersionFromManifest({
      conversationId: this.conversation.id,
      parentVersionId: this.conversation.currentVersionId ?? null,
      createdByMessageId: this.currentTurnUserMessageId,
      manifest,
    });
  }

  // Replace this conversation's snapshots with the given manifest:
  // upsert every entry, then delete any DB rows whose path is no longer present.
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

  // Build agent messages from db, filtering out turns abandoned by restore.
  // Algorithm: walk parent_version_id from currentVersionId → "active chain"
  // of versions; user messages whose version is OFF the active chain (along
  // with their assistant/tool replies) are skipped. Restore checkpoint nodes
  // are host-side meta events and never reach the agent.
  private async _buildAgentMessages(): Promise<Message[]> {
    const [rows, allVersions] = await Promise.all([
      db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, this.conversation.id))
        .orderBy(messages.createdAt),
      db
        .select({
          id: versions.id,
          parentVersionId: versions.parentVersionId,
          createdByMessageId: versions.createdByMessageId,
        })
        .from(versions)
        .where(eq(versions.conversationId, this.conversation.id)),
    ]);

    const activeIds = new Set(computeActiveChain(allVersions, this.conversation.currentVersionId));
    const discardedUserMessageIds = new Set<string>();
    for (const v of allVersions) {
      if (!activeIds.has(v.id) && v.createdByMessageId) {
        discardedUserMessageIds.add(v.createdByMessageId);
      }
    }

    const stored: StoredMessage[] = [];
    let inDiscardMode = false;
    for (const r of rows) {
      const metadata = (r.metadata as Record<string, unknown> | null) ?? undefined;
      if (metadata?.type === "restore_checkpoint") continue;

      if (r.role === "user") {
        inDiscardMode = discardedUserMessageIds.has(r.id);
        if (inDiscardMode) continue;
      } else if (inDiscardMode) {
        continue;
      }

      stored.push({
        id: r.id,
        conversationId: r.conversationId,
        createdAt: r.createdAt.toISOString(),
        metadata,
        role: r.role,
        content: r.content,
      } as StoredMessage);
    }

    return buildAgentMessages(stored as Message[]);
  }
}
