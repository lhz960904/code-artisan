import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { websocket } from "hono/bun";
import { env } from "./env.js";
import { startDbHeartbeat } from "./db/heartbeat.js";
import { errorHandler, notFoundHandler, ok } from "./http/index.js";
import { auth } from "./auth.js";
import { requireAuth } from "./middlewares/require-auth.js";
import { conversationRouter } from "./routes/conversation.js";
import { messageRouter } from "./routes/message.js";
import { snapshotRouter } from "./routes/snapshot.js";
import { attachmentRouter } from "./routes/attachment.js";
import { userRouter } from "./routes/user.js";
import { settingRouter } from "./routes/setting.js";
import { conversationWsRouter } from "./routes/conversation-ws.js";
import { modelsRouter } from "./routes/models.js";
import { versionRouter } from "./routes/version.js";
import { integrationRouter } from "./routes/integration.js";
import { deploymentRouter } from "./routes/deployment.js";
import { databaseRouter } from "./routes/database.js";
import { publicRouter } from "./routes/public.js";

const app = new Hono();

app.use("*", logger());
app.onError(errorHandler);
app.notFound(notFoundHandler);

app.get("/api/health", (c) => ok(c, { status: "ok" }));

// better-auth handler — handles /api/auth/sign-in/*, /callback/*, /session, etc.
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/conversation-ws", conversationWsRouter);
// Public: static model catalog (user-tier filtering will add optional session lookup later).
app.route("/api/models", modelsRouter);
// Public: share-link read-only access (no session required).
app.route("/api/public", publicRouter);

// Everything below requires an authenticated session.
app.use("/api/*", requireAuth);

app.route("/api/conversation", conversationRouter);
app.route("/api/conversation", versionRouter);
app.route("/api/conversation", databaseRouter);
app.route("/api/message", messageRouter);
app.route("/api/snapshot", snapshotRouter);
app.route("/api/attachment", attachmentRouter);
app.route("/api/user", userRouter);
app.route("/api/setting", settingRouter);
app.route("/api/integration", integrationRouter);
app.route("/api/deployment", deploymentRouter);

// Serve frontend static files (production)
app.use("*", serveStatic({ root: "./dist/public" }));
// SPA fallback — serve index.html for all non-API routes
app.get("*", serveStatic({ root: "./dist/public", path: "index.html" }));

console.log(`Server running on http://localhost:${env.PORT}`);

startDbHeartbeat();

const BUN_IDLE_TIMEOUT_SEC = 120;

export default {
  port: env.PORT,
  fetch: app.fetch,
  websocket,
  idleTimeout: BUN_IDLE_TIMEOUT_SEC,
};
