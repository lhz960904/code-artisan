import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { ConversationSettings } from "@code-artisan/shared";
import { DomainException } from "../common/exceptions/domain.exception.js";
import { ConversationRepository } from "./conversation.repository.js";

export interface UpdateConversationInput {
  title?: string;
  settings?: Partial<ConversationSettings>;
}

@Injectable()
export class ConversationService {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  create(userId: string, title?: string) {
    return this.conversationRepo.create(userId, title ?? null);
  }

  list(userId: string) {
    return this.conversationRepo.listByUser(userId);
  }

  async getDetail(userId: string, id: string) {
    const conversation = await this.requireOwned(userId, id);
    // TODO: re-attach previewUrl from ShellSessionManager once shell-session
    // migrates. Cross-process singleton can't be read from backend-nest yet.
    return { ...conversation, previewUrl: null as string | null };
  }

  // Public ownership primitive — other modules (snapshot, version, message, …)
  // call this to validate access to a conversation before doing their work.
  async requireOwned(userId: string, id: string) {
    const row = await this.conversationRepo.findOwnedById(userId, id);
    if (!row) throw new NotFoundException("Conversation not found");
    return row;
  }

  async update(userId: string, id: string, input: UpdateConversationInput) {
    const existing = await this.requireOwned(userId, id);
    const nextSettings = input.settings
      ? { ...((existing.settings as ConversationSettings) ?? {}), ...input.settings }
      : undefined;
    return this.conversationRepo.updateOwned(userId, id, {
      title: input.title,
      settings: nextSettings,
    });
  }

  async share(userId: string, id: string) {
    const existing = await this.requireOwned(userId, id);
    if (!existing.deployUrl) {
      throw new DomainException(
        "Publish before sharing",
        HttpStatus.BAD_REQUEST,
        "SHARE_REQUIRES_DEPLOY",
      );
    }
    if (existing.shareSlug) {
      return { shareSlug: existing.shareSlug, sharedAt: existing.sharedAt };
    }
    return this.conversationRepo.setShareSlug(userId, id, {
      shareSlug: randomBytes(8).toString("base64url"),
      sharedAt: new Date(),
    });
  }

  async unshare(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.conversationRepo.clearShareSlug(userId, id);
    return { shareSlug: null as string | null, sharedAt: null as Date | null };
  }

  async remove(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.conversationRepo.removeWithCascade(id);
    return { deleted: true };
  }
}
