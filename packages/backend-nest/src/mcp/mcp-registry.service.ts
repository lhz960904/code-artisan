import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { McpRegistryServer } from "@code-artisan/shared";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { settings } from "../db/schema.js";
import registryFile from "./mcp-registry.json" with { type: "json" };

export const SETTINGS_KEY_MCP = "mcp";

export interface McpInstalledEntry {
  envVars: Record<string, string>;
  installedAt: string;
}
export type McpSettingsValue = Record<string, McpInstalledEntry>;

interface RegistryFile {
  servers?: McpRegistryServer[];
}

@Injectable()
export class McpRegistryService {
  private cached: McpRegistryServer[] | null = null;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  loadRegistry(): McpRegistryServer[] {
    if (this.cached) return this.cached;
    this.cached = (registryFile as RegistryFile).servers ?? [];
    return this.cached;
  }

  async readUserMcp(userId: string): Promise<McpSettingsValue> {
    const [row] = await this.db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.userId, userId), eq(settings.key, SETTINGS_KEY_MCP)));
    return (row?.value as McpSettingsValue) ?? {};
  }

  async writeUserMcp(userId: string, value: McpSettingsValue): Promise<void> {
    await this.db
      .insert(settings)
      .values({ userId, key: SETTINGS_KEY_MCP, value })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value, updatedAt: new Date() },
      });
  }
}
