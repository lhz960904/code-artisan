import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class UpdateConversationDto extends createZodDto(
  z.object({
    title: z.string().optional(),
    settings: z.object({ systemPrompt: z.string().optional() }).optional(),
  }),
) {}
