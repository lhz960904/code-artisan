import * as z from "zod";
import { eq } from "drizzle-orm";
import { defineTool, type FunctionTool } from "@code-artisan/agent";
import { db } from "../../db";
import { conversations } from "../../db/schema";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";
import {
  createSupabaseProject,
  getStoredSupabaseToken,
  getSupabaseProjectKeys,
  SupabaseNotConnectedError,
  SupabaseOAuthNotConfiguredError,
  SupabaseProjectInitFailedError,
  SupabaseProjectProvisionTimeoutError,
  SupabaseTokenInvalidError,
} from "../integration/supabase-client";
import { writeSupabaseEnvLocal } from "../integration/sandbox-env";

export function createSupabaseCreateProjectTool(opts: {
  userId: string;
  conversationId: string;
}): FunctionTool {
  return defineTool({
    name: "supabase_create_project",
    description:
      "Provision a fresh Supabase project under the user's connected organization for this conversation. " +
      "Returns the project ref + URL + anon key, and writes them into the sandbox's .env.local as " +
      "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. After this succeeds, kill the running dev session and " +
      "restart it (`bash` with run_in_background) so Vite picks up the new env. " +
      "Idempotent — if this conversation already has a project, returns the existing one and refreshes .env.local. " +
      "Use ONLY when the app needs persistent data / auth / file storage / realtime; do not use for static demos.",
    parameters: z.object({
      name: z
        .string()
        .min(1)
        .max(60)
        .describe("Project name shown in the user's Supabase dashboard. Use a slug-style name like 'todo-app'."),
      region: z
        .string()
        .optional()
        .describe(
          "AWS region (e.g. 'us-east-1', 'eu-west-1', 'ap-southeast-1'). Defaults to 'us-east-1' when omitted.",
        ),
    }),
    invoke: async (input, ctx) => {
      try {
        const [existing] = await db
          .select({
            ref: conversations.supabaseProjectRef,
            url: conversations.supabaseUrl,
            anonKey: conversations.supabaseAnonKey,
          })
          .from(conversations)
          .where(eq(conversations.id, opts.conversationId));

        if (existing?.ref && existing.url && existing.anonKey) {
          await writeSupabaseEnvLocal(ctx.sandbox as E2BSandbox, {
            url: existing.url,
            anonKey: existing.anonKey,
          });
          return {
            ref: existing.ref,
            url: existing.url,
            anon_key: existing.anonKey,
            already_existed: true,
            message:
              `Project ${existing.ref} is already attached to this conversation. ` +
              `.env.local has been refreshed; restart the dev server to pick it up.`,
          };
        }

        const stored = await getStoredSupabaseToken(opts.userId);
        if (!stored?.org_id) throw new SupabaseNotConnectedError();

        const result = await createSupabaseProject({
          userId: opts.userId,
          name: input.name,
          orgId: stored.org_id,
          region: input.region,
        });

        const keys = await getSupabaseProjectKeys({
          userId: opts.userId,
          projectRef: result.ref,
        });

        await db
          .update(conversations)
          .set({
            supabaseProjectRef: result.ref,
            supabaseUrl: result.url,
            supabaseAnonKey: keys.anonKey,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, opts.conversationId));

        await writeSupabaseEnvLocal(ctx.sandbox as E2BSandbox, {
          url: result.url,
          anonKey: keys.anonKey,
        });

        return {
          ref: result.ref,
          url: result.url,
          anon_key: keys.anonKey,
          region: result.region,
          already_existed: false,
          message:
            `Provisioned Supabase project ${result.ref} in ${result.region}. ` +
            `.env.local was written with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY. ` +
            `To activate them, kill the current dev session, then start it again with bash(run_in_background: true).`,
        };
      } catch (err) {
        return formatSupabaseToolError("supabase_create_project", err);
      }
    },
  });
}

export function formatSupabaseToolError(toolName: string, err: unknown): string {
  if (err instanceof SupabaseOAuthNotConfiguredError) {
    return `${toolName} unavailable: this code-artisan instance has no Supabase OAuth credentials configured. Inform the user.`;
  }
  if (err instanceof SupabaseNotConnectedError) {
    return `${toolName} failed: the user has not connected Supabase. Tell them to open Settings → Integrations → Connect Supabase, then retry.`;
  }
  if (err instanceof SupabaseTokenInvalidError) {
    return `${toolName} failed: the user's Supabase token has expired or been revoked. Tell them to reconnect from Settings → Integrations.`;
  }
  if (err instanceof SupabaseProjectProvisionTimeoutError) {
    return `${toolName} failed: project ${err.projectRef} did not reach ACTIVE_HEALTHY within 90s (last status: ${err.lastStatus}). It may still come up — wait 30-60s and retry; supabase_create_project is idempotent.`;
  }
  if (err instanceof SupabaseProjectInitFailedError) {
    return `${toolName} failed: project ${err.projectRef} reported INIT_FAILED. The user must delete it from their Supabase dashboard before retrying.`;
  }
  return `${toolName} failed: ${err instanceof Error ? err.message : String(err)}`;
}
