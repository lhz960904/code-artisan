import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { eq } from "drizzle-orm";
import { env } from "./env.js";
import { db } from "./db/index.js";
import { userQuotas } from "./db/schema.js";
import { conversationsRouter } from "./routes/conversations.js";
import { uploadRouter } from "./routes/upload.js";

const app = new Hono();

app.use("*", logger());

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/conversations", conversationsRouter);
app.route("/api/upload", uploadRouter);

// Get user quota (hardcoded user for now)
app.get("/api/quota", async (c) => {
  const userId = "00000000-0000-0000-0000-000000000000";

  const [quota] = await db
    .select()
    .from(userQuotas)
    .where(eq(userQuotas.userId, userId));

  if (!quota) {
    return c.json({ totalTokens: 1000000, usedTokens: 0, remaining: 1000000 });
  }

  return c.json({
    totalTokens: quota.totalTokens,
    usedTokens: quota.usedTokens,
    remaining: quota.totalTokens - quota.usedTokens,
  });
});

// Serve frontend static files (production)
app.use("*", serveStatic({ root: "./dist/public" }));
// SPA fallback — serve index.html for all non-API routes
app.get("*", serveStatic({ root: "./dist/public", path: "index.html" }));

console.log(`Server running on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
