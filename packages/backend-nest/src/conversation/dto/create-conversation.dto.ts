import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class CreateConversationDto extends createZodDto(
  z.object({ title: z.string().optional() }),
) {}
