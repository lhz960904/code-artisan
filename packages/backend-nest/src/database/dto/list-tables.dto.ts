import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class ListTablesParamDto extends createZodDto(
  z.object({ conversationId: z.uuid() }),
) {}
