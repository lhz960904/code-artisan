import { Hono } from "hono";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { and, eq } from "drizzle-orm";
import type { McpRegistryServer, McpServerListItem } from "@code-artisan/shared";

import { db } from "../db/index.js";
import { settings } from "../db/schema.js";
import { ok, created, badRequest, notFound, validate } from "../http/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SETTINGS_KEY_MCP = "mcp";

interface McpInstalledEntry {
  envVars: Record<string, string>;
  installedAt: string;
}
type McpSettingsValue = Record<string, McpInstalledEntry>;

function loadRegistry(): McpRegistryServer[] {
  const registryPath = join(__dirname, "../mcp/mcp-registry.json");
  if (!existsSync(registryPath)) return [];
  const data = JSON.parse(readFileSync(registryPath, "utf-8"));
  return data.servers;
}

async function readMcpSettings(userId: string): Promise<McpSettingsValue> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, SETTINGS_KEY_MCP)));
  return (row?.value as McpSettingsValue) ?? {};
}

async function writeMcpSettings(userId: string, value: McpSettingsValue): Promise<void> {
  await db
    .insert(settings)
    .values({ userId, key: SETTINGS_KEY_MCP, value })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value, updatedAt: new Date() },
    });
}

const settingRouter = new Hono();

// GET / — list all servers with install status
settingRouter.get(
  "/",
  validate("query", z.object({ search: z.string().optional() })),
  async (c) => {
    const { search } = c.req.valid("query");
    const keyword = search?.toLowerCase();
    const user = c.get("user");
    const registry = loadRegistry();
    const installed = await readMcpSettings(user.id);

    let result: McpServerListItem[] = registry.map((server) => ({
      ...server,
      installed: !!installed[server.id],
    }));

    if (keyword) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(keyword) ||
          s.description.toLowerCase().includes(keyword) ||
          s.tags.some((t) => t.toLowerCase().includes(keyword)),
      );
    }

    return ok(c, result);
  },
);

// POST /install — install a server
settingRouter.post(
  "/install",
  validate(
    "json",
    z.object({
      serverId: z.string().min(1),
      envVars: z.record(z.string(), z.string()),
    }),
  ),
  async (c) => {
    const { serverId, envVars } = c.req.valid("json");
    const user = c.get("user");

    const registry = loadRegistry();
    const serverDef = registry.find((s) => s.id === serverId);
    if (!serverDef) {
      return badRequest(c, `Server "${serverId}" not found in registry`);
    }

    const missingVars = serverDef.envVars
      .filter((v) => v.required && !envVars[v.name])
      .map((v) => v.name);
    if (missingVars.length > 0) {
      return badRequest(c, `Missing required parameters: ${missingVars.join(", ")}`);
    }

    const current = await readMcpSettings(user.id);
    current[serverId] = { envVars, installedAt: new Date().toISOString() };
    await writeMcpSettings(user.id, current);

    return created(c, { serverId });
  },
);

// DELETE /:serverId — uninstall a server
settingRouter.delete(
  "/:serverId",
  validate("param", z.object({ serverId: z.string().min(1) })),
  async (c) => {
    const { serverId } = c.req.valid("param");
    const user = c.get("user");
    const current = await readMcpSettings(user.id);
    if (!current[serverId]) return notFound(c, "Server not installed");
    delete current[serverId];
    await writeMcpSettings(user.id, current);
    return ok(c, { serverId });
  },
);

// PATCH /:serverId — update envVars for an installed server
settingRouter.patch(
  "/:serverId",
  validate("param", z.object({ serverId: z.string().min(1) })),
  validate("json", z.object({ envVars: z.record(z.string(), z.string()) })),
  async (c) => {
    const { serverId } = c.req.valid("param");
    const { envVars } = c.req.valid("json");
    const user = c.get("user");

    const current = await readMcpSettings(user.id);
    const entry = current[serverId];
    if (!entry) return notFound(c, "Server not installed");
    current[serverId] = { ...entry, envVars };
    await writeMcpSettings(user.id, current);
    return ok(c, { serverId });
  },
);

export { settingRouter };
