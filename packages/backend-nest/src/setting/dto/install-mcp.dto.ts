import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class InstallMcpDto extends createZodDto(
  z.object({
    serverId: z.string().min(1),
    envVars: z.record(z.string(), z.string()),
  }),
) {}
