import { Module } from "@nestjs/common";
import { ConversationModule } from "../conversation/conversation.module.js";
import { MessageModule } from "../message/message.module.js";
import { SnapshotModule } from "../snapshot/snapshot.module.js";
import { PublicController } from "./public.controller.js";
import { PublicService } from "./public.service.js";

@Module({
  imports: [ConversationModule, MessageModule, SnapshotModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
