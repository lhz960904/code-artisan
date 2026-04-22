import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { env } from "./env.js";
import { errorHandler, notFoundHandler, ok } from "./http/index.js";
import { auth } from "./auth.js";
import { requireAuth } from "./middlewares/require-auth.js";
import { conversationRouter } from "./routes/conversation.js";
import { messageRouter } from "./routes/message.js";
import { snapshotRouter } from "./routes/snapshot.js";
import { attachmentRouter } from "./routes/attachment.js";
import { userRouter } from "./routes/user.js";
import { settingRouter } from "./routes/setting.js";
import { terminalRouter, terminalWebSocket } from "./routes/terminal.js";

const app = new Hono();

app.use("*", logger());
app.onError(errorHandler);
app.notFound(notFoundHandler);

app.get("/api/health", (c) => ok(c, { status: "ok" }));

// better-auth handler — handles /api/auth/sign-in/*, /callback/*, /session, etc.
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Everything below requires an authenticated session.
app.use("/api/*", requireAuth);

app.route("/api/conversation", conversationRouter);
app.route("/api/message", messageRouter);
app.route("/api/snapshot", snapshotRouter);
app.route("/api/attachment", attachmentRouter);
app.route("/api/user", userRouter);
app.route("/api/setting", settingRouter);
app.route("/api/terminal", terminalRouter);

// Serve frontend static files (production)
app.use("*", serveStatic({ root: "./dist/public" }));
// SPA fallback — serve index.html for all non-API routes
app.get("*", serveStatic({ root: "./dist/public", path: "index.html" }));

console.log(`Server running on http://localhost:${env.PORT}`);

const BUN_IDLE_TIMEOUT_SEC = 120;

export default {
  port: env.PORT,
  fetch: app.fetch,
  websocket: terminalWebSocket,
  idleTimeout: BUN_IDLE_TIMEOUT_SEC,
};
