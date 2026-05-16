import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class DeploymentConversationIdParamDto extends createZodDto(
  z.object({ conversationId: z.uuid() }),
) {}
