import { eq } from "drizzle-orm";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import { db } from "../../db/index.js";
import { conversations, deployments, type DeploymentStatus } from "../../db/schema.js";
import { acquireConversationSandbox } from "../conversation-sandbox.js";
import {
  VercelNotConnectedError,
  createVercelProject,
  getStoredVercelToken,
  getVercelProject,
} from "../integration/vercel-client.js";

export type DeploymentRow = typeof deployments.$inferSelect;

const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Deploy the conversation's current sandbox state to Vercel.
 * Sync — caller awaits the full deploy. Day 3 will wrap this in SSE.
 */
export async function deployConversation(params: {
  conversationId: string;
  userId: string;
}): Promise<DeploymentRow> {
  const { conversationId, userId } = params;

  const token = await getStoredVercelToken(userId);
  if (!token) throw new VercelNotConnectedError();

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conv) throw new Error(`Conversation not found: ${conversationId}`);

  const [row] = await db
    .insert(deployments)
    .values({
      conversationId,
      versionId: conv.currentVersionId,
      status: "pending" satisfies DeploymentStatus,
    })
    .returning();

  try {
    const projectId = await ensureVercelProject({
      conversation: conv,
      token,
      userId,
    });

    const orgId = token.team_id ?? token.user_id;

    const { sandbox } = await acquireConversationSandbox(conversationId, conv.sandboxId);

    await sandbox.writeFile(
      `${SANDBOX_WORKSPACE_ROOT}/.vercel/project.json`,
      JSON.stringify({ projectId, orgId }),
    );

    await markStatus(row.id, "building");

    const installResult = await sandbox.exec(
      `cd ${SANDBOX_WORKSPACE_ROOT} && (test -d node_modules || bun install)`,
      { timeoutMs: 180_000 },
    );
    if (installResult.exitCode !== 0) {
      throw new Error(`Install failed: ${installResult.stderr.slice(0, 500)}`);
    }

    await markStatus(row.id, "uploading");

    const deployCmd = [
      `cd ${SANDBOX_WORKSPACE_ROOT}`,
      `npx --yes vercel@latest deploy --prod --yes --token=${shellQuote(token.access_token)}`,
    ].join(" && ");

    const deployResult = await sandbox.exec(deployCmd, { timeoutMs: DEPLOY_TIMEOUT_MS });

    const url = parseVercelDeployUrl(deployResult.stdout + "\n" + deployResult.stderr);

    if (deployResult.exitCode !== 0 || !url) {
      const message =
        deployResult.stderr.slice(0, 500) ||
        deployResult.stdout.slice(-500) ||
        "Vercel CLI exited without a URL";
      throw new Error(`vercel deploy failed: ${message}`);
    }

    const [updated] = await db
      .update(deployments)
      .set({ status: "live" satisfies DeploymentStatus, publicUrl: url })
      .where(eq(deployments.id, row.id))
      .returning();

    await db
      .update(conversations)
      .set({ deployUrl: url, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [failed] = await db
      .update(deployments)
      .set({ status: "failed" satisfies DeploymentStatus, errorMessage: message.slice(0, 1000) })
      .where(eq(deployments.id, row.id))
      .returning();
    return failed;
  }
}

async function markStatus(id: string, status: DeploymentStatus): Promise<void> {
  await db.update(deployments).set({ status }).where(eq(deployments.id, id));
}

async function ensureVercelProject(params: {
  conversation: typeof conversations.$inferSelect;
  token: NonNullable<Awaited<ReturnType<typeof getStoredVercelToken>>>;
  userId: string;
}): Promise<string> {
  const { conversation, token, userId } = params;
  if (conversation.vercelProjectId) {
    const existing = await getVercelProject({
      accessToken: token.access_token,
      userId,
      teamId: token.team_id,
      projectId: conversation.vercelProjectId,
    });
    if (existing) return existing.id;
    // Project was deleted on Vercel side — fall through to recreate.
  }

  const name = vercelProjectNameFor(conversation.id);
  const created = await createVercelProject({
    accessToken: token.access_token,
    userId,
    teamId: token.team_id,
    name,
  });
  await db
    .update(conversations)
    .set({ vercelProjectId: created.id })
    .where(eq(conversations.id, conversation.id));
  return created.id;
}

function vercelProjectNameFor(conversationId: string): string {
  const short = conversationId.replace(/-/g, "").slice(0, 12);
  return `code-artisan-${short}`;
}

function parseVercelDeployUrl(output: string): string | null {
  const matches = output.match(/https?:\/\/[a-z0-9-]+\.vercel\.app/gi);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
