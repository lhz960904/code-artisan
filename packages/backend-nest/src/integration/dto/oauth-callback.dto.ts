import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class OAuthCallbackQueryDto extends createZodDto(
  z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
  }),
) {}
