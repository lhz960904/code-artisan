import { Module } from "@nestjs/common";
import { ConversationModule } from "../conversation/conversation.module.js";
import { SnapshotController } from "./snapshot.controller.js";
import { SnapshotRepository } from "./snapshot.repository.js";
import { SnapshotService } from "./snapshot.service.js";

@Module({
  imports: [ConversationModule],
  controllers: [SnapshotController],
  providers: [SnapshotService, SnapshotRepository],
})
export class SnapshotModule {}
