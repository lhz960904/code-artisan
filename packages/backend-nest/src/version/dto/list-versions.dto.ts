import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class ListVersionsParamDto extends createZodDto(
  z.object({ conversationId: z.uuid() }),
) {}
