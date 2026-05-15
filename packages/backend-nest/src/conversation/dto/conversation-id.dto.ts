import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class ConversationIdParamDto extends createZodDto(z.object({ id: z.uuid() })) {}
