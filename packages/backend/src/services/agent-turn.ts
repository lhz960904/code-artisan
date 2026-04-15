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
import type { NonSystemMessage, StoredMessage, WebAgentEvent } from "@code-artisan/shared";
import { getSandboxPool } from "../sandbox";
import { db } from "../db";
import { conversations, fileSnapshots, messages } from "../db/schema";
import { eq } from "drizzle-orm";
import { buildAgentMessages } from "../utils/message";
import { checkQuotaMiddleware } from "./middlewares/check-quota";

export class AgentTurnService {
  private agent: Agent | null = null;

  private pendingEvents: WebAgentEvent[] = [];

  constructor(
    private conversationId: string,
    private userId: string,
  ) {}

  async *run(userMessage: UserMessage): AsyncGenerator<WebAgentEvent> {
    await this._insertMessage(userMessage);

    const resumeMessages = await this._buildAgentMessages();

    if (!this.agent) {
      this.agent = await this._setupAgent(resumeMessages);
    }

    for await (const event of this.agent.stream(userMessage)) {
      if (this.pendingEvents.length > 0) {
        yield this.pendingEvents.shift()!;
        break;
      }
      yield event;
      if (event.type === "message") await this._insertMessage(event.message);
    }
    this.pendingEvents = [];
  }

  private async _setupAgent(resumeMessages: Message[]): Promise<Agent> {
    const sandbox = await this._setupSandbox();
    const provider = new AnthropicProvider("minimax-m2.5", {
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL,
    });

    const middlewares: AgentMiddleware[] = [
      microCompactMiddleware(),
      autoCompactMiddleware({
        onCompacted: async ([summaryUser, ackAssistant]) => {
          // Persist so subsequent runs don't blow the token budget again.
          // await store.addMessage(summaryUser, { compacted: true });
          // await store.addMessage(ackAssistant);
        },
      }),
      // check quota exceeded
      checkQuotaMiddleware(this.userId, () => {
        this.pendingEvents.push({ type: "quota_exceeded" });
      }),
      // TODO: files modify persistence tracking
    ];

    return createAgent({
      model: provider,
      sandbox: sandbox,
      prompt: `You are a helpful coding assistant. you are working in a sandbox.`,
      initMessages: resumeMessages as NonSystemMessage[],
      middlewares,
      // TODO: how to integration mcp tools and skills, if need to put in sandbox?
      tools: [],
      skillsDirs: [],
    });
  }

  private async _setupSandbox(): Promise<Sandbox> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, this.conversationId));
    const pool = getSandboxPool();
    const sandbox = await pool.acquire(conversation.sandboxId ?? undefined);

    if (sandbox.sandboxId !== conversation.sandboxId) {
      // restore file snapshot
      const snapshots = await db
        .select()
        .from(fileSnapshots)
        .where(eq(fileSnapshots.conversationId, this.conversationId));
      for (const snap of snapshots) {
        try {
          await sandbox.writeFile(snap.path, snap.content);
        } catch (error) {
          console.error(`[AgentTurnService] failed to restore file snapshot ${snap.path}:`, error);
        }
      }
      // sync sandbox id to conversation
      await db
        .update(conversations)
        .set({ sandboxId: sandbox.sandboxId })
        .where(eq(conversations.id, this.conversationId));
    }

    return sandbox;
  }

  /** Insert a message to db */
  private async _insertMessage(message: Message): Promise<void> {
    await db
      .insert(messages)
      .values({ conversationId: this.conversationId, role: message.role, content: message.content });
  }

  /** Build agent messages from db */
  private async _buildAgentMessages(): Promise<Message[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, this.conversationId))
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

// async upsertFileSnapshot(path: string, content: string): Promise<void> {
//   await db
//     .insert(fileSnapshots)
//     .values({
//       conversationId: this.conversationId,
//       path,
//       content,
//     })
//     .onConflictDoUpdate({
//       target: [fileSnapshots.conversationId, fileSnapshots.path],
//       set: { content, updatedAt: new Date() },
//     });
// }
