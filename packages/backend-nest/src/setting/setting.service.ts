import { HttpStatus, Injectable } from "@nestjs/common";
import type { McpServerListItem } from "@code-artisan/shared";
import { DomainException } from "../common/exceptions/domain.exception.js";
import { McpCatalogService } from "../mcp/mcp-catalog.service.js";
import { SettingsRepository } from "./settings.repository.js";

@Injectable()
export class SettingService {
  constructor(
    private readonly catalog: McpCatalogService,
    private readonly settingsRepo: SettingsRepository,
  ) {}

  async listServers(userId: string, search?: string): Promise<McpServerListItem[]> {
    const installed = await this.settingsRepo.readMcpSettings(userId);
    const all: McpServerListItem[] = this.catalog.list().map((server) => ({
      ...server,
      installed: !!installed[server.id],
    }));
    if (!search) return all;
    const keyword = search.toLowerCase();
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(keyword) ||
        s.description.toLowerCase().includes(keyword) ||
        s.tags.some((t) => t.toLowerCase().includes(keyword)),
    );
  }

  async install(userId: string, serverId: string, envVars: Record<string, string>): Promise<void> {
    const def = this.catalog.findById(serverId);
    if (!def) {
      throw new DomainException(
        `Server "${serverId}" not found in registry`,
        HttpStatus.BAD_REQUEST,
        "MCP_SERVER_NOT_FOUND",
      );
    }
    const missing = def.envVars.filter((v) => v.required && !envVars[v.name]).map((v) => v.name);
    if (missing.length > 0) {
      throw new DomainException(
        `Missing required parameters: ${missing.join(", ")}`,
        HttpStatus.BAD_REQUEST,
        "MCP_MISSING_ENV_VARS",
      );
    }
    const current = await this.settingsRepo.readMcpSettings(userId);
    current[serverId] = { envVars, installedAt: new Date().toISOString() };
    await this.settingsRepo.writeMcpSettings(userId, current);
  }

  async uninstall(userId: string, serverId: string): Promise<void> {
    const current = await this.settingsRepo.readMcpSettings(userId);
    if (!current[serverId]) {
      throw new DomainException(
        "Server not installed",
        HttpStatus.NOT_FOUND,
        "MCP_SERVER_NOT_INSTALLED",
      );
    }
    delete current[serverId];
    await this.settingsRepo.writeMcpSettings(userId, current);
  }

  async updateEnvVars(
    userId: string,
    serverId: string,
    envVars: Record<string, string>,
  ): Promise<void> {
    const current = await this.settingsRepo.readMcpSettings(userId);
    const entry = current[serverId];
    if (!entry) {
      throw new DomainException(
        "Server not installed",
        HttpStatus.NOT_FOUND,
        "MCP_SERVER_NOT_INSTALLED",
      );
    }
    current[serverId] = { ...entry, envVars };
    await this.settingsRepo.writeMcpSettings(userId, current);
  }
}
