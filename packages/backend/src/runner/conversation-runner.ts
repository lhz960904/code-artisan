import { eq } from "drizzle-orm";
import {
  createAgent,
  AnthropicProvider,
  loopDetectionMiddleware,
  microCompactMiddleware,
  autoCompactMiddleware,
  type AgentMiddleware,
  type AssistantMessage,
  type ToolMessage,
  type FunctionTool,
  type UserMessage as AgentUserMessage,
} from "@code-artisan/agent";
import type { StoredAssistantMessage, StoredToolMessage } from "@code-artisan/shared";

import { env } from "../env.js";
import { db } from "../db/index.js";
import { conversations, mcpServers } from "../db/schema.js";
import { eventBus } from "../services/event-bus.js";
import { MessageStore } from "../services/message-store.js";
import { QuotaService } from "../services/quota.js";
import { getSandboxPool } from "../sandbox/index.js";
import { McpToolSet, type McpServerConfig } from "../mcp/mcp-tools.js";

import { buildAgentMessages } from "./messages.js";
import { tokenUsageMiddleware } from "./token-usage.js";
import { generateConversationTitle } from "./title-generation.js";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MAIN_MODEL = "claude-opus-4-5-20250929";
const SUMMARY_MODEL = "claude-haiku-4-5-20251001";
const MAX_STEPS = 30;
const WORKSPACE_DIR = "/home/user";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Track running runners per conversation for external abort. */
const runners = new Map<string, { abort: () => void }>();

export function stopRunner(conversationId: string): boolean {
  const r = runners.get(conversationId);
  if (!r) return false;
  r.abort();
  return true;
}

export interface RunParams {
  conversationId: string;
  /** Id of the user message that was just persisted and is triggering the run. */
  newUserMessageId: string;
}

/**
 * Orchestrates one run of an agent conversation.
 *
 * Responsibilities:
 *  - load stored messages, rebuild agent message history
 *  - acquire/reconnect sandbox, restore files if new
 *  - configure tools (builtin + MCP) and middlewares (infra + business)
 *  - pre-step: kick off title generation (don't block)
 *  - drive agent.invoke(), persist each yielded message, emit SSE
 *  - post-step: persist file snapshots touched by the run
 *  - maintain agentRunning flag + sandboxId on the conversation row
 */
export async function runConversation(params: RunParams): Promise<void> {
  const { conversationId, newUserMessageId } = params;

  const abortFlag = { aborted: false };
  runners.set(conversationId, { abort: () => { abortFlag.aborted = true; } });

  await db
    .update(conversations)
    .set({ agentRunning: true, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const store = new MessageStore(conversationId);
  const mcpSet = new McpToolSet();
  let sandboxIdSnapshot: string | null = null;

  try {
    // --- Load conversation + messages ---
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);

    const stored = await store.getMessages();
    const all = buildAgentMessages(stored);

    // The newest user message is the trigger; peel it off so we can
    // pass it to agent.invoke() separately and keep agent.invoke()'s
    // "new turn" semantics clean.
    const triggerIdx = stored.findIndex((m) => m.id === newUserMessageId);
    if (triggerIdx < 0) {
      throw new Error(`Trigger user message ${newUserMessageId} missing`);
    }
    const historyForAgent = all.slice(0, triggerIdx);
    const triggerMessage = all[triggerIdx]! as AgentUserMessage;

    // --- Sandbox ---
    const pool = getSandboxPool();
    const sandbox = await pool.acquire(conv.sandboxId ?? undefined);
    sandboxIdSnapshot = sandbox.sandboxId;

    // New sandbox? Restore file snapshots.
    if (sandbox.sandboxId !== conv.sandboxId) {
      const snapshots = await store.getFileSnapshots();
      for (const snap of snapshots) {
        await sandbox.writeFile(snap.path, snap.content).catch(() => {});
      }
      await db
        .update(conversations)
        .set({ sandboxId: sandbox.sandboxId })
        .where(eq(conversations.id, conversationId));
    }

    // --- Pre-step: title (fire-and-forget) ---
    const firstUser = all.find((m) => m.role === "user") as AgentUserMessage | undefined;
    if (firstUser) {
      void generateConversationTitle({
        conversationId,
        firstUserMessage: firstUser,
        summaryModel: new AnthropicProvider(SUMMARY_MODEL, { apiKey: env.ANTHROPIC_API_KEY }),
      });
    }

    // --- MCP tools ---
    const mcpConfigs = await loadMcpConfigs(conv.userId);
    const mcpTools = mcpConfigs.length > 0 ? await mcpSet.initialize(mcpConfigs) : [];

    // --- Middlewares ---
    const quota = new QuotaService(conv.userId);
    const touchedPaths = new Set<string>();

    const middlewares: AgentMiddleware[] = [
      // Cooperative external-abort: check a shared flag before each model call.
      {
        beforeModel: async ({ agentContext }) => {
          if (abortFlag.aborted) agentContext.shouldStop = true;
        },
      },
      // Track write_file / str_replace paths for post-run snapshot upsert.
      {
        afterToolUse: async ({ toolUse }) => {
          if (toolUse.name === "write_file" || toolUse.name === "str_replace") {
            const path = (toolUse.input as { path?: string }).path;
            if (path) touchedPaths.add(path);
          }
        },
      },
      loopDetectionMiddleware(),
      microCompactMiddleware(),
      autoCompactMiddleware({
        summaryModel: new AnthropicProvider(SUMMARY_MODEL, { apiKey: env.ANTHROPIC_API_KEY }),
        onCompacted: async ([summaryUser, ackAssistant]) => {
          // Persist so subsequent runs don't blow the token budget again.
          await store.addMessage(summaryUser, { compacted: true });
          await store.addMessage(ackAssistant);
        },
      }),
      tokenUsageMiddleware(quota, () => {
        eventBus.emit(conversationId, {
          type: "error",
          error: "Token quota exceeded.",
        });
      }),
    ];

    // --- Agent ---
    const model = new AnthropicProvider(MAIN_MODEL, { apiKey: env.ANTHROPIC_API_KEY });
    const agent = createAgent({
      model,
      sandbox,
      prompt: buildSystemPrompt(),
      maxSteps: MAX_STEPS,
      tools: mcpTools as FunctionTool[],
      middlewares,
    });

    // Seed the agent with history before the trigger.
    // (Agent appends the trigger itself via invoke(msg).)
    for (const m of historyForAgent) {
      // Agent currently exposes no public "seed history" API; we
      // reach into its messages via a typed cast.
      (agent as unknown as { messages: typeof historyForAgent }).messages.push(m);
    }

    // --- Drive the loop, persist + emit each yield ---
    const nameByToolUseId = buildToolNameMap(historyForAgent);

    for await (const yielded of agent.invoke(triggerMessage)) {
      if (yielded.role === "assistant") {
        const { id, createdAt } = await store.addMessage(yielded);
        // Extend the name map with any new tool_use ids from this turn
        for (const c of yielded.content) {
          if (c.type === "tool_use") nameByToolUseId.set(c.id, c.name);
        }
        const stored: StoredAssistantMessage = {
          ...(yielded as AssistantMessage),
          id,
          conversationId,
          createdAt,
        };
        eventBus.emit(conversationId, { type: "message", message: stored });
      } else if (yielded.role === "tool") {
        const { id, createdAt } = await store.addMessage(yielded);
        const stored: StoredToolMessage = {
          ...(yielded as ToolMessage),
          id,
          conversationId,
          createdAt,
        };
        eventBus.emit(conversationId, { type: "message", message: stored });
      }
    }

    // --- Post: persist touched files, emit file event ---
    if (touchedPaths.size > 0) {
      const files: Array<{ path: string; content: string }> = [];
      for (const path of touchedPaths) {
        try {
          const content = await sandbox.readFile(path);
          await store.upsertFileSnapshot(path, content);
          files.push({ path, content });
        } catch (err) {
          console.error(`[runner] file snapshot ${path} failed:`, err);
        }
      }
      if (files.length > 0) {
        eventBus.emit(conversationId, { type: "file", files });
      }
    }

    eventBus.emit(conversationId, { type: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[runner] conversation ${conversationId} error:`, err);
    eventBus.emit(conversationId, { type: "error", error: message });
  } finally {
    runners.delete(conversationId);
    await mcpSet.close().catch(() => {});
    await db
      .update(conversations)
      .set({ agentRunning: false })
      .where(eq(conversations.id, conversationId))
      .catch(() => {});
    void sandboxIdSnapshot; // keep reference, pool manages lifecycle
  }
}

// ============================================================
// Helpers
// ============================================================

function buildSystemPrompt(): string {
  return `You are an AI coding agent working in a sandboxed Linux environment at ${WORKSPACE_DIR}.

You help users write code, execute commands, and build projects. Always use absolute paths when calling tools. Prefer str_replace for targeted edits over rewriting entire files. Be concise in your text responses.`;
}

function buildToolNameMap(messages: Array<{ role: string; content: unknown[] }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const c of msg.content) {
      const block = c as { type?: string; id?: string; name?: string };
      if (block.type === "tool_use" && block.id && block.name) {
        map.set(block.id, block.name);
      }
    }
  }
  return map;
}

async function loadMcpConfigs(userId: string): Promise<McpServerConfig[]> {
  const installed = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, userId));
  if (installed.length === 0) return [];

  const registry = loadMcpRegistry();
  return installed
    .filter((s) => registry[s.serverId])
    .map((s) => ({
      serverId: s.serverId,
      command: registry[s.serverId]!.command,
      args: registry[s.serverId]!.args,
      envVars: (s.envVars as Record<string, string>) || {},
    }));
}

function loadMcpRegistry(): Record<string, { command: string; args: string[] }> {
  try {
    const registryPath = join(__dirname, "../mcp/mcp-registry.json");
    const data = JSON.parse(readFileSync(registryPath, "utf-8")) as {
      servers: Array<{ id: string; command: string; args: string[] }>;
    };
    const map: Record<string, { command: string; args: string[] }> = {};
    for (const server of data.servers) {
      map[server.id] = { command: server.command, args: server.args };
    }
    return map;
  } catch {
    return {};
  }
}
