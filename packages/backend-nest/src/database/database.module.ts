import { Module } from "@nestjs/common";
import { ConversationModule } from "../conversation/conversation.module.js";
import { IntegrationModule } from "../integration/integration.module.js";
import { DatabaseController } from "./database.controller.js";
import { DatabaseService } from "./database.service.js";

@Module({
  imports: [ConversationModule, IntegrationModule],
  controllers: [DatabaseController],
  providers: [DatabaseService],
})
export class DatabaseModule {}
