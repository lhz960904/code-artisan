import { Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { DeploymentService } from "./deployment.service.js";
import { DeploymentConversationIdParamDto } from "./dto/conversation-id.dto.js";

@Controller("deployment")
export class DeploymentController {
  constructor(private readonly deploymentService: DeploymentService) {}

  @Get(":conversationId")
  list(@CurrentUser() user: AuthUser, @Param() param: DeploymentConversationIdParamDto) {
    return this.deploymentService.listForOwnedConversation(user.id, param.conversationId);
  }

  @Post(":conversationId")
  startDeploy(@CurrentUser() user: AuthUser, @Param() param: DeploymentConversationIdParamDto) {
    return this.deploymentService.startDeploy(user.id, param.conversationId);
  }
}
