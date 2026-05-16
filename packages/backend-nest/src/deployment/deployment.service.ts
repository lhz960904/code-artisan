import { HttpStatus, Injectable } from "@nestjs/common";
import { DomainException } from "../common/exceptions/domain.exception.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { DeploymentRepository } from "./deployment.repository.js";

// startDeploy needs the E2B sandbox runtime + Vercel CLI execution inside the
// sandbox. Land alongside message + WS migrations when sandbox pool moves.
const SANDBOX_PENDING_MESSAGE = "Sandbox runtime not yet available on backend-nest";
const SANDBOX_PENDING_CODE = "SANDBOX_MIGRATION_PENDING";

@Injectable()
export class DeploymentService {
  constructor(
    private readonly deploymentRepo: DeploymentRepository,
    private readonly conversationService: ConversationService,
  ) {}

  async listForOwnedConversation(userId: string, conversationId: string) {
    await this.conversationService.requireOwned(userId, conversationId);
    return this.deploymentRepo.listByConversationId(conversationId);
  }

  async startDeploy(userId: string, conversationId: string): Promise<never> {
    await this.conversationService.requireOwned(userId, conversationId);
    throw new DomainException(
      SANDBOX_PENDING_MESSAGE,
      HttpStatus.SERVICE_UNAVAILABLE,
      SANDBOX_PENDING_CODE,
    );
  }
}
