import { Injectable } from "@nestjs/common";
import type { McpRegistryServer } from "@code-artisan/shared";
import registryFile from "./mcp-registry.json" with { type: "json" };

interface RegistryFile {
  servers?: McpRegistryServer[];
}

@Injectable()
export class McpCatalogService {
  private cached: McpRegistryServer[] | null = null;

  list(): McpRegistryServer[] {
    if (this.cached) return this.cached;
    this.cached = (registryFile as RegistryFile).servers ?? [];
    return this.cached;
  }

  findById(serverId: string): McpRegistryServer | null {
    return this.list().find((s) => s.id === serverId) ?? null;
  }
}
