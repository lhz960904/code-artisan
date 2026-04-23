import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { and, eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../db";
import { conversations } from "../db/schema";
import { acquireConversationSandbox } from "../services/conversation-sandbox";
import {
  getShellSessionManager,
  type SessionListener,
  type SessionMeta,
  type Unsubscribe,
} from "../services/shell-session";

type ClientMessage =
  | { op: "hello" }
  | { op: "attach"; sessionId: string; cols: number; rows: number; sinceOffset?: number }
  | { op: "detach"; sessionId: string }
  | { op: "create"; draftId?: string; command?: string; cols: number; rows: number; cwd?: string }
  | { op: "input"; sessionId: string; data: string }
  | { op: "resize"; sessionId: string; cols: number; rows: number }
  | { op: "kill"; sessionId: string };

type ServerMessage =
  | { op: "sessions"; sessions: SessionMeta[] }
  | { op: "snapshot"; sessionId: string; data: string; nextOffset: number }
  | { op: "data"; sessionId: string; data: string; offset: number }
  | { op: "exit"; sessionId: string; exitCode: number }
  | { op: "session_started"; meta: SessionMeta }
  | { op: "session_ended"; sessionId: string; exitCode: number }
  | { op: "created"; draftId?: string; meta: SessionMeta }
  | { op: "create_failed"; draftId?: string; message: string }
  | { op: "error"; message: string; cause?: string };

interface ConnectionState {
  userId: string;
  conversationId: string;
  perSession: Map<string, Unsubscribe>;
  conversationUnsubscribe: Unsubscribe | null;
}

const manager = getShellSessionManager();

function send(ws: WSContext, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function sendError(ws: WSContext, message: string, cause?: unknown): void {
  const payload: ServerMessage = { op: "error", message };
  if (cause !== undefined) payload.cause = cause instanceof Error ? cause.message : String(cause);
  ws.send(JSON.stringify(payload));
}

export const terminalWsRouter = new Hono();

terminalWsRouter.get(
  "/ws",
  upgradeWebSocket(async (c) => {
    const url = new URL(c.req.url);
    const conversationId = url.searchParams.get("conversationId");
    if (!conversationId) {
      return {
        onOpen: (_evt, ws) => {
          sendError(ws, "missing conversationId query param");
          ws.close(1008, "missing conversationId");
        },
      };
    }

    const sessionRes = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!sessionRes) {
      return {
        onOpen: (_evt, ws) => {
          sendError(ws, "unauthorized");
          ws.close(1008, "unauthorized");
        },
      };
    }

    const [conversion] = await db
      .select({ id: conversations.id, userId: conversations.userId })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, sessionRes.user.id)))
      .limit(1);
    if (!conversion) {
      return {
        onOpen: (_evt, ws) => {
          sendError(ws, "conversation not found or access denied");
          ws.close(1008, "forbidden");
        },
      };
    }

    const state: ConnectionState = {
      userId: sessionRes.user.id,
      conversationId,
      perSession: new Map(),
      conversationUnsubscribe: null,
    };

    return {
      onOpen: (_evt, ws) => {
        state.conversationUnsubscribe = manager.subscribeConversation(conversationId, (event) => {
          if (event.kind === "session_started") send(ws, { op: "session_started", meta: event.meta });
          else if (event.kind === "session_ended")
            send(ws, { op: "session_ended", sessionId: event.sessionId, exitCode: event.exitCode });
        });
        send(ws, { op: "sessions", sessions: manager.list(conversationId) });
      },
      onMessage: async (evt, ws) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(typeof evt.data === "string" ? evt.data : new TextDecoder().decode(evt.data as ArrayBuffer));
        } catch {
          sendError(ws, "invalid JSON");
          return;
        }

        try {
          switch (msg.op) {
            case "hello":
              send(ws, { op: "sessions", sessions: manager.list(conversationId) });
              return;

            case "attach": {
              const session = manager.get(msg.sessionId);
              if (!session || session.conversationId !== conversationId) {
                sendError(ws, `session=${msg.sessionId} not found`);
                return;
              }
              if (state.perSession.has(msg.sessionId)) return;

              const tail = session.readTail(msg.sinceOffset);
              send(ws, { op: "snapshot", sessionId: msg.sessionId, data: tail.data, nextOffset: tail.nextOffset });

              const listener: SessionListener = (ev) => {
                if (ev.kind === "data") {
                  send(ws, { op: "data", sessionId: msg.sessionId, data: ev.data, offset: ev.offset });
                } else {
                  send(ws, { op: "exit", sessionId: msg.sessionId, exitCode: ev.exitCode });
                }
              };
              const unsubscribe = session.subscribe(listener);
              state.perSession.set(msg.sessionId, unsubscribe);

              // Honor the client's declared size immediately.
              await session.resize(msg.cols, msg.rows).catch(() => undefined);
              return;
            }

            case "detach": {
              const unsubscribe = state.perSession.get(msg.sessionId);
              if (unsubscribe) {
                unsubscribe();
                state.perSession.delete(msg.sessionId);
              }
              return;
            }

            case "create": {
              try {
                const [conv] = await db
                  .select({ sandboxId: conversations.sandboxId })
                  .from(conversations)
                  .where(eq(conversations.id, conversationId))
                  .limit(1);
                // Reuses the agent path's acquire+restore helper — so a user
                // terminal on a cold/expired sandbox sees the conversation's
                // persisted files instead of an empty workspace.
                const { sandbox } = await acquireConversationSandbox(conversationId, conv?.sandboxId ?? null);

                const created = await manager.create({
                  conversationId,
                  sandbox,
                  owner: "user",
                  command: msg.command,
                  cols: msg.cols,
                  rows: msg.rows,
                  cwd: msg.cwd,
                });
                send(ws, { op: "created", draftId: msg.draftId, meta: created.meta() });
              } catch (err) {
                send(ws, {
                  op: "create_failed",
                  draftId: msg.draftId,
                  message: err instanceof Error ? err.message : String(err),
                });
              }
              return;
            }

            case "input":
              await manager.sendInput(msg.sessionId, msg.data);
              return;

            case "resize":
              await manager.resize(msg.sessionId, msg.cols, msg.rows);
              return;

            case "kill":
              await manager.kill(msg.sessionId);
              return;
          }
        } catch (err) {
          sendError(ws, `op=${(msg as { op: string }).op} failed`, err);
        }
      },
      onClose: () => {
        state.conversationUnsubscribe?.();
        for (const unsub of state.perSession.values()) unsub();
        state.perSession.clear();
      },
    };
  }),
);
