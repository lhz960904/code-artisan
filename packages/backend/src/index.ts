import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { eq } from "drizzle-orm";
import { env } from "./env.js";
import { db } from "./db/index.js";
import { userQuotas } from "./db/schema.js";
import { conversationsRouter } from "./routes/conversations.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        "http://localhost:5173",
        process.env.FRONTEND_URL,
      ].filter(Boolean) as string[];
      return allowed.includes(origin) ? origin : allowed[0];
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/conversations", conversationsRouter);

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

console.log(`Backend running on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
