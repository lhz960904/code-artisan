import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { ok, notFound, validate } from "../http/index.js";
import { runSupabaseSql } from "../services/integration/supabase-client.js";

const databaseRouter = new Hono();

async function getProjectRef(conversationId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ ref: conversations.supabaseProjectRef })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return row?.ref ?? null;
}

// Postgres identifiers are quoted in the generated SQL, but we still gate the
// raw input via regex so a quote/backslash in the URL can't break out.
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

databaseRouter.get(
  "/:id/database/tables",
  validate("param", z.object({ id: z.uuid() })),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const ref = await getProjectRef(id, user.id);
    if (!ref) return notFound(c, "No Supabase project on this conversation");

    const rows = await runSupabaseSql({
      userId: user.id,
      projectRef: ref,
      query: `
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
    });
    return ok(c, { tables: rows.map((r) => r.name as string) });
  },
);

databaseRouter.get(
  "/:id/database/tables/:name",
  validate(
    "param",
    z.object({
      id: z.uuid(),
      name: z.string().min(1).max(63).regex(IDENT_RE),
    }),
  ),
  validate(
    "query",
    z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const { id, name } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const ref = await getProjectRef(id, user.id);
    if (!ref) return notFound(c, "No Supabase project on this conversation");

    const rows = await runSupabaseSql({
      userId: user.id,
      projectRef: ref,
      query: `SELECT * FROM "public"."${name}" LIMIT ${limit} OFFSET ${offset}`,
    });
    return ok(c, { rows });
  },
);

export { databaseRouter };
