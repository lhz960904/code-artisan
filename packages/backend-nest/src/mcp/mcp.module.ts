import { Module } from "@nestjs/common";
import { McpRegistryService } from "./mcp-registry.service.js";

@Module({
  providers: [McpRegistryService],
  exports: [McpRegistryService],
})
export class McpModule {}
