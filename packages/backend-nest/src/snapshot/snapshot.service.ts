import { Injectable } from "@nestjs/common";
import { ConversationService } from "../conversation/conversation.service.js";
import { SnapshotRepository } from "./snapshot.repository.js";

@Injectable()
export class SnapshotService {
  constructor(
    private readonly snapshotRepo: SnapshotRepository,
    private readonly conversationService: ConversationService,
  ) {}

  async listForOwnedConversation(userId: string, conversationId: string) {
    await this.conversationService.requireOwned(userId, conversationId);
    return this.snapshotRepo.listByConversationId(conversationId);
  }
}
