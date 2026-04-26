import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { McpRegistryServer } from "@code-artisan/shared";
import { db } from "../db/index.js";
import { settings } from "../db/schema.js";
import type { McpServerConfig } from "./mcp-tools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const SETTINGS_KEY_MCP = "mcp";

export interface McpInstalledEntry {
  envVars: Record<string, string>;
  installedAt: string;
}
export type McpSettingsValue = Record<string, McpInstalledEntry>;

let cachedRegistry: McpRegistryServer[] | null = null;

export function loadRegistry(): McpRegistryServer[] {
  if (cachedRegistry) return cachedRegistry;
  const registryPath = join(__dirname, "mcp-registry.json");
  if (!existsSync(registryPath)) {
    cachedRegistry = [];
    return cachedRegistry;
  }
  const data = JSON.parse(readFileSync(registryPath, "utf-8"));
  cachedRegistry = data.servers ?? [];
  return cachedRegistry!;
}

export async function readUserMcpSettings(userId: string): Promise<McpSettingsValue> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, SETTINGS_KEY_MCP)));
  return (row?.value as McpSettingsValue) ?? {};
}

export async function getInstalledMcpServers(userId: string): Promise<McpServerConfig[]> {
  const installed = await readUserMcpSettings(userId);
  const ids = Object.keys(installed);
  if (ids.length === 0) return [];
  const registry = loadRegistry();
  const configs: McpServerConfig[] = [];
  for (const serverId of ids) {
    const def = registry.find((s) => s.id === serverId);
    if (!def) continue;
    configs.push({
      serverId,
      command: def.command,
      args: def.args,
      envVars: installed[serverId].envVars,
    });
  }
  return configs;
}
