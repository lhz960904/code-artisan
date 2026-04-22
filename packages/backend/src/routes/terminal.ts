import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getSandboxPool } from "../sandbox/index.js";
import type { TerminalClientMessage, TerminalServerMessage } from "@code-artisan/shared";

export const { upgradeWebSocket, websocket: terminalWebSocket } = createBunWebSocket<ServerWebSocket>();

export const terminalRouter = new Hono();

/**
 * WebSocket endpoint for PTY terminal sessions.
 * URL: /api/terminal/:conversationId
 *
 * On connect:
 *   - Resolves the conversation's sandbox
 *   - Sends the full output history of all sessions
 *   - Subscribes to live PTY output, forwarding to the WebSocket
 *
 * Client → Server messages: TerminalClientMessage (JSON)
 * Server → Client messages: TerminalServerMessage (JSON)
 */
terminalRouter.get(
  "/:conversationId",
  upgradeWebSocket(async (c) => {
    const conversationId = c.req.param("conversationId") ?? "";

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation?.sandboxId) {
      return {
        onOpen(_event, ws) {
          ws.close(1011, "Sandbox not found");
        },
      };
    }

    const sandbox = getSandboxPool().get(conversation.sandboxId);
    if (!sandbox) {
      return {
        onOpen(_event, ws) {
          ws.close(1011, "Sandbox not active");
        },
      };
    }

    const manager = sandbox.terminalManager;
    const unsubscribes: Array<() => void> = [];

    return {
      onOpen(_event, ws) {
        // Replay history for all existing sessions and subscribe to future output.
        for (const session of manager.list()) {
          const history = manager.getHistory(session.id);
          if (history.length > 0) {
            const msg: TerminalServerMessage = { type: "history", data: Array.from(history) };
            ws.send(JSON.stringify(msg));
          }

          const unsub = manager.subscribe(session.id, (data) => {
            const msg: TerminalServerMessage = { type: "output", sessionId: session.id, data: Array.from(data) };
            ws.send(JSON.stringify(msg));
          });
          unsubscribes.push(unsub);
        }
      },

      onMessage(event, ws) {
        let msg: TerminalClientMessage;
        try {
          msg = JSON.parse(String(event.data)) as TerminalClientMessage;
        } catch {
          return;
        }

        // Use the first running session as the active one.
        const activeSessions = manager.list().filter((s) => s.status === "running");
        if (activeSessions.length === 0) return;
        const activeId = activeSessions[activeSessions.length - 1].id;

        if (msg.type === "input") {
          manager.write(activeId, msg.data).catch(console.error);
        } else if (msg.type === "resize") {
          manager.resize(activeId, msg.cols, msg.rows).catch(console.error);
        } else if (msg.type === "signal") {
          const char = msg.signal === "SIGINT" ? "\x03" : "\x1c";
          manager.write(activeId, char).catch(console.error);
        }
      },

      onClose() {
        for (const unsub of unsubscribes) unsub();
      },
    };
  }),
);
