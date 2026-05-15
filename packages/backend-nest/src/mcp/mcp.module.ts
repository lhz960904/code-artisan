import { Module } from "@nestjs/common";
import { McpCatalogService } from "./mcp-catalog.service.js";

@Module({
  providers: [McpCatalogService],
  exports: [McpCatalogService],
})
export class McpModule {}
