import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// Postgres identifier — the table name lands in the SQL after a quote, but
// we still gate the raw input here so a quote/backslash in the URL can't
// break out before the quoting layer.
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class ListRowsParamDto extends createZodDto(
  z.object({
    conversationId: z.uuid(),
    name: z.string().min(1).max(63).regex(IDENT_RE),
  }),
) {}

export class ListRowsQueryDto extends createZodDto(
  z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }),
) {}
