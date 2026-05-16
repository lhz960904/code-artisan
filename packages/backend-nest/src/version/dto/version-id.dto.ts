import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class VersionIdParamDto extends createZodDto(
  z.object({ conversationId: z.uuid(), versionId: z.uuid() }),
) {}
