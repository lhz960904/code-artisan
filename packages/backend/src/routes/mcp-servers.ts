import { Hono } from "hono";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { db } from "../db/index.js";
import { mcpServers } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { McpRegistryServer, McpServerListItem } from "@code-artisan/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadRegistry(): McpRegistryServer[] {
  const registryPath = join(__dirname, "../mcp/mcp-registry.json");
  const data = JSON.parse(readFileSync(registryPath, "utf-8"));
  return data.servers;
}

const mcpServersRouter = new Hono();

// Hardcoded user for now (same pattern as /api/quota)
const HARDCODED_USER_ID = "00000000-0000-0000-0000-000000000000";

// GET / — list all servers with install status
mcpServersRouter.get("/", async (c) => {
  const search = c.req.query("search")?.toLowerCase();
  const registry = loadRegistry();

  const installed = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, HARDCODED_USER_ID));

  const installedMap = new Map(installed.map((s) => [s.serverId, s]));

  let result: McpServerListItem[] = registry.map((server) => {
    const inst = installedMap.get(server.id);
    return {
      ...server,
      installed: !!inst,
      installedId: inst?.id,
    };
  });

  if (search) {
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.description.toLowerCase().includes(search) ||
        s.tags.some((t) => t.toLowerCase().includes(search)),
    );
  }

  return c.json(result);
});

// POST /install — install a server
mcpServersRouter.post("/install", async (c) => {
  const { serverId, envVars } = await c.req.json<{
    serverId: string;
    envVars: Record<string, string>;
  }>();

  const registry = loadRegistry();
  const serverDef = registry.find((s) => s.id === serverId);
  if (!serverDef) {
    return c.json({ error: `Server "${serverId}" not found in registry` }, 400);
  }

  const missingVars = serverDef.envVars
    .filter((v) => v.required && !envVars[v.name])
    .map((v) => v.name);

  if (missingVars.length > 0) {
    return c.json({ error: `Missing required parameters: ${missingVars.join(", ")}` }, 400);
  }

  const [row] = await db
    .insert(mcpServers)
    .values({
      userId: HARDCODED_USER_ID,
      serverId,
      envVars,
    })
    .onConflictDoUpdate({
      target: [mcpServers.userId, mcpServers.serverId],
      set: { envVars },
    })
    .returning();

  return c.json({ id: row.id }, 201);
});

// DELETE /:id — uninstall a server
mcpServersRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const deleted = await db
    .delete(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, HARDCODED_USER_ID)))
    .returning();

  if (deleted.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

// PATCH /:id — update envVars
mcpServersRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const { envVars } = await c.req.json<{ envVars: Record<string, string> }>();

  const [updated] = await db
    .update(mcpServers)
    .set({ envVars })
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, HARDCODED_USER_ID)))
    .returning();

  if (!updated) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { mcpServersRouter };
