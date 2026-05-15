import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class PatchMcpDto extends createZodDto(
  z.object({ envVars: z.record(z.string(), z.string()) }),
) {}
