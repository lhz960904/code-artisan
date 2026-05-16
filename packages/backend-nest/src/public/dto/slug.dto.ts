import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class SlugParamDto extends createZodDto(
  z.object({ slug: z.string().min(1).max(64) }),
) {}
