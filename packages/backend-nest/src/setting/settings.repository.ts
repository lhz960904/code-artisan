import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { settings } from "../db/schema.js";

export const SETTINGS_KEY_MCP = "mcp";

export interface McpInstalledEntry {
  envVars: Record<string, string>;
  installedAt: string;
}
export type McpSettingsValue = Record<string, McpInstalledEntry>;

@Injectable()
export class SettingsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async readMcpSettings(userId: string): Promise<McpSettingsValue> {
    const [row] = await this.db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.userId, userId), eq(settings.key, SETTINGS_KEY_MCP)));
    return (row?.value as McpSettingsValue) ?? {};
  }

  async writeMcpSettings(userId: string, value: McpSettingsValue): Promise<void> {
    await this.db
      .insert(settings)
      .values({ userId, key: SETTINGS_KEY_MCP, value })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value, updatedAt: new Date() },
      });
  }
}
