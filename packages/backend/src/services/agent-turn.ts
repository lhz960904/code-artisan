import {
  Agent,
  AgentMiddleware,
  AnthropicProvider,
  autoCompactMiddleware,
  createAgent,
  Message,
  microCompactMiddleware,
  ProcessHandle,
  UserMessage,
  webFetchTool,
  webSearchTool,
} from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import type { NonSystemMessage, StoredMessage, WebAgentEvent } from "@code-artisan/shared";
import { getSandboxPool } from "../sandbox";
import type { E2BSandbox } from "../sandbox/e2b-sandbox";
import { db } from "../db";
import { conversations, fileSnapshots, messages } from "../db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { buildAgentMessages } from "../utils/message";
import { checkQuotaMiddleware, isQuotaExceeded } from "./middlewares/check-quota";
import { fileTrackerMiddleware } from "./middlewares/track-file-changes";
import { generateTitleMiddleware } from "./middlewares/generate-title";

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

    const [expandedUserMessage] = buildAgentMessages([userMessage]);

    yield { type: "user_message_saved", messageId: userMessageId };

    // Server-side pre-flight: stop before any model invocation.
    if (await isQuotaExceeded(this.conversation.userId)) {
      yield { type: "quota_exceeded" };
      return;
    }

    // Wire terminal streaming: whenever the bash tool starts a background
    // process via sandbox.spawn(), fan its stdout/stderr into SSE events.
    sandboxResult.sandbox.onProcessStart = (handle, command) => {
      this._relayBackgroundProcess(handle, command);
    };

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
      prompt: [
        `You are a helpful coding assistant operating inside an isolated sandbox.`,
        `Your project workspace is at \`${SANDBOX_WORKSPACE_ROOT}\`. Treat it as the root of the user's project — all source files, configs, and generated artefacts belong under it.`,
        `The shell's default working directory is already \`${SANDBOX_WORKSPACE_ROOT}\`. Run commands directly (e.g. \`npm install\`, \`ls src\`) — do NOT prefix with \`cd ${SANDBOX_WORKSPACE_ROOT}\`. Only \`cd\` when you genuinely need to operate outside the workspace (e.g. \`cd /home/user && npm create vite@latest scaffold\` before moving files in). Prefer relative paths inside the workspace (\`src/index.ts\`) and absolute paths for anything outside it.`,
        `Do not read or write files outside \`${SANDBOX_WORKSPACE_ROOT}\` (e.g. dotfiles in /home/user, system paths) — they are invisible to the user and won't be persisted.`,
        `Binary assets (images, fonts, archives, media files) are NOT persisted across sessions — only text files are. For images, prefer inline SVG or external CDN URLs (e.g. unsplash, placehold.co) over curl/wget downloads. For fonts, prefer Google Fonts / self-hosting CDN links over local font files.`,
        `For long-running processes (dev servers like \`npm run dev\`, watchers, tails), call \`bash\` with \`run_in_background: true\` — the command returns immediately with a PID and its output streams live into the user's terminal panel. Do NOT background one-shot commands; those must run foreground so you receive their output directly.`,
      ].join("\n\n"),
      initMessages: resumeMessages as NonSystemMessage[],
      middlewares,
      // TODO: how to integration mcp tools and skills, if need to put in sandbox?
      tools: [webSearchTool, webFetchTool],
      skillsDirs: [],
    });
  }

  private async _setupSandbox(): Promise<{ sandbox: E2BSandbox; initialFiles: Map<string, string> | null }> {
    const pool = getSandboxPool();
    const [sandbox, snapshots] = await Promise.all([
      pool.acquire(this.conversation.sandboxId ?? undefined),
      db.select().from(fileSnapshots).where(eq(fileSnapshots.conversationId, this.conversation.id)),
    ]);

    const initialFiles: Map<string, string> | null =
      snapshots.length > 0 ? new Map(snapshots.map((s) => [s.path, s.content])) : null;

    if (sandbox.sandboxId !== this.conversation.sandboxId) {
      // workspaceRoot is pre-created by E2BSandbox.create; no mkdir needed here.
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

  /**
   * Fan a newly-spawned process's stdout/stderr into SSE terminal events.
   * Called by the sandbox's `onProcessStart` hook for each background bash.
   */
  private _relayBackgroundProcess(handle: ProcessHandle, command: string): void {
    const terminalId = randomUUID();
    this.pendingEvents.push({ type: "terminal_start", id: terminalId, command });

    const relayStream = async (stream: AsyncIterable<string>, kind: "stdout" | "stderr") => {
      try {
        for await (const chunk of stream) {
          this.pendingEvents.push({ type: "terminal_chunk", id: terminalId, stream: kind, data: chunk });
        }
      } catch (err) {
        console.error(`[AgentTurnService] terminal ${kind} stream error:`, err);
      }
    };

    void relayStream(handle.stdout, "stdout");
    void relayStream(handle.stderr, "stderr");

    handle.wait().then(
      (exitCode) => {
        this.pendingEvents.push({ type: "terminal_exit", id: terminalId, exitCode });
      },
      (err) => {
        console.error(`[AgentTurnService] terminal wait error:`, err);
        this.pendingEvents.push({ type: "terminal_exit", id: terminalId, exitCode: -1 });
      },
    );
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
