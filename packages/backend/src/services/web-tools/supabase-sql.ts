import * as z from "zod";
import { eq } from "drizzle-orm";
import { defineTool, type FunctionTool } from "@code-artisan/agent";
import { db } from "../../db";
import { conversations } from "../../db/schema";
import { runSupabaseSql } from "../integration/supabase-client";
import { formatSupabaseToolError } from "./supabase-create-project";

const MAX_ROWS_RETURNED = 100;

export function createSupabaseSqlTool(opts: {
  userId: string;
  conversationId: string;
}): FunctionTool {
  return defineTool({
    name: "supabase_sql",
    description:
      "Run SQL against this conversation's Supabase project (Postgres) via the Management API. " +
      "Use it for DDL (CREATE TABLE, ALTER TABLE), RLS setup (ENABLE ROW LEVEL SECURITY, CREATE POLICY), " +
      "indexes, seeds (INSERT/UPDATE), and inspection (SELECT). Runs under the user's OAuth Bearer token — " +
      "no service-role key is exposed. If no project is attached yet, call supabase_create_project first.",
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          "Full SQL. Multiple statements separated by semicolons are supported. " +
            "When creating user-owned tables, ALWAYS enable RLS and add policies keyed on auth.uid().",
        ),
    }),
    invoke: async (input) => {
      try {
        const [conv] = await db
          .select({ ref: conversations.supabaseProjectRef })
          .from(conversations)
          .where(eq(conversations.id, opts.conversationId));

        if (!conv?.ref) {
          return (
            "supabase_sql failed: this conversation has no Supabase project yet. " +
            "Call supabase_create_project first, then retry."
          );
        }

        const rows = await runSupabaseSql({
          userId: opts.userId,
          projectRef: conv.ref,
          query: input.query,
        });

        if (rows.length === 0) {
          return { rows: [], row_count: 0, message: "OK (statement completed; no rows returned)." };
        }

        if (rows.length > MAX_ROWS_RETURNED) {
          return {
            rows: rows.slice(0, MAX_ROWS_RETURNED),
            row_count: rows.length,
            truncated: true,
            message: `Returned ${rows.length} rows; only the first ${MAX_ROWS_RETURNED} are shown. Add LIMIT/WHERE to narrow the result.`,
          };
        }

        return { rows, row_count: rows.length };
      } catch (err) {
        return formatSupabaseToolError("supabase_sql", err);
      }
    },
  });
}
