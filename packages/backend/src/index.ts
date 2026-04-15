import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { env } from "./env.js";
import { errorHandler, notFoundHandler } from "./http/index.js";
import { conversationRouter } from "./routes/conversation.js";
import { messageRouter } from "./routes/message.js";
import { snapshotRouter } from "./routes/snapshot.js";
import { attachmentRouter } from "./routes/attachment.js";
import { userRouter } from "./routes/user.js";
import { settingRouter } from "./routes/setting.js";

const app = new Hono();

app.use("*", logger());
app.onError(errorHandler);
app.notFound(notFoundHandler);

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/conversation", conversationRouter);
app.route("/api/message", messageRouter);
app.route("/api/snapshot", snapshotRouter);
app.route("/api/attachment", attachmentRouter);
app.route("/api/user", userRouter);
app.route("/api/setting", settingRouter);

// Serve frontend static files (production)
app.use("*", serveStatic({ root: "./dist/public" }));
// SPA fallback — serve index.html for all non-API routes
app.get("*", serveStatic({ root: "./dist/public", path: "index.html" }));

console.log(`Server running on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
