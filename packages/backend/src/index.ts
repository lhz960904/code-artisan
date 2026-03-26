import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: env.PORT }, () => {
  console.log(`Backend running on http://localhost:${env.PORT}`);
});
