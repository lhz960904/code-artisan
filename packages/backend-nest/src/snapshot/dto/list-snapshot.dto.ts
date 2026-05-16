import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class ListSnapshotParamDto extends createZodDto(
  z.object({ conversationId: z.uuid() }),
) {}
