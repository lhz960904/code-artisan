import { Module } from "@nestjs/common";
import { ConversationController } from "./conversation.controller.js";
import { ConversationRepository } from "./conversation.repository.js";
import { ConversationService } from "./conversation.service.js";

@Module({
  controllers: [ConversationController],
  providers: [ConversationService, ConversationRepository],
  // Other modules call ConversationService.requireOwned for ownership checks.
  exports: [ConversationService],
})
export class ConversationModule {}
