import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { DomainException } from "../common/exceptions/domain.exception.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { VersionRepository } from "./version.repository.js";

// preview/restore depend on the E2B sandbox pool and version-service runtime
// (acquireConversationSandbox / syncSandboxToVersion / restoreToVersion),
// which still live in the Hono backend's process. Stub until those migrate.
const SANDBOX_PENDING_MESSAGE = "Sandbox runtime not yet available on backend-nest";
const SANDBOX_PENDING_CODE = "SANDBOX_MIGRATION_PENDING";

@Injectable()
export class VersionService {
  constructor(
    private readonly versionRepo: VersionRepository,
    private readonly conversationService: ConversationService,
  ) {}

  async listForOwnedConversation(userId: string, conversationId: string) {
    const conversation = await this.conversationService.requireOwned(userId, conversationId);
    const rows = await this.versionRepo.listByConversationId(conversationId);
    return rows.map((r) => ({ ...r, isCurrent: r.id === conversation.currentVersionId }));
  }

  async listFiles(userId: string, conversationId: string, versionId: string) {
    const owned = await this.versionRepo.findOwnedVersion(userId, conversationId, versionId);
    if (!owned) throw new NotFoundException("Version not found");
    return this.versionRepo.listFilesByVersionId(versionId);
  }

  async preview(_userId: string, _conversationId: string, _versionId: string): Promise<never> {
    throw new DomainException(
      SANDBOX_PENDING_MESSAGE,
      HttpStatus.SERVICE_UNAVAILABLE,
      SANDBOX_PENDING_CODE,
    );
  }

  async restore(_userId: string, _conversationId: string, _versionId: string): Promise<never> {
    throw new DomainException(
      SANDBOX_PENDING_MESSAGE,
      HttpStatus.SERVICE_UNAVAILABLE,
      SANDBOX_PENDING_CODE,
    );
  }
}
