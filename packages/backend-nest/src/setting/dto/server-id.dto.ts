import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class ServerIdParamDto extends createZodDto(
  z.object({ serverId: z.string().min(1) }),
) {}
