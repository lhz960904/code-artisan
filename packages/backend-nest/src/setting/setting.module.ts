import { Module } from "@nestjs/common";
import { McpModule } from "../mcp/mcp.module.js";
import { SettingController } from "./setting.controller.js";
import { SettingService } from "./setting.service.js";

@Module({
  imports: [McpModule],
  controllers: [SettingController],
  providers: [SettingService],
})
export class SettingModule {}
