import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class ListMcpQueryDto extends createZodDto(
  z.object({ search: z.string().optional() }),
) {}
