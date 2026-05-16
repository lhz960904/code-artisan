import { Injectable } from "@nestjs/common";
import { ConversationService } from "../conversation/conversation.service.js";
import { MessageRepository } from "../message/message.repository.js";
import { SnapshotRepository } from "../snapshot/snapshot.repository.js";

@Injectable()
export class PublicService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageRepo: MessageRepository,
    private readonly snapshotRepo: SnapshotRepository,
  ) {}

  async getShare(slug: string) {
    const conversation = await this.conversationService.findShareableBySlug(slug);
    const [messages, files] = await Promise.all([
      this.messageRepo.listByConversationId(conversation.id),
      this.snapshotRepo.listByConversationId(conversation.id),
    ]);
    return { conversation, messages, files };
  }
}
