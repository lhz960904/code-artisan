import { Module } from "@nestjs/common";
import { ConversationModule } from "../conversation/conversation.module.js";
import { VersionController } from "./version.controller.js";
import { VersionRepository } from "./version.repository.js";
import { VersionService } from "./version.service.js";

@Module({
  imports: [ConversationModule],
  controllers: [VersionController],
  providers: [VersionService, VersionRepository],
})
export class VersionModule {}
