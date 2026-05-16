import { Module } from "@nestjs/common";
import { ConversationModule } from "../conversation/conversation.module.js";
import { DeploymentController } from "./deployment.controller.js";
import { DeploymentRepository } from "./deployment.repository.js";
import { DeploymentService } from "./deployment.service.js";

@Module({
  imports: [ConversationModule],
  controllers: [DeploymentController],
  providers: [DeploymentService, DeploymentRepository],
})
export class DeploymentModule {}
