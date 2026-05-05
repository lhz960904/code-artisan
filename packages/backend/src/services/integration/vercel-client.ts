import { env } from "../../env.js";
import {
  SETTINGS_KEY_VERCEL_OAUTH,
  deleteEncryptedSetting,
  readEncryptedSetting,
  writeEncryptedSetting,
} from "./oauth-storage.js";

export type VercelOAuthToken = {
  access_token: string;
  installation_id: string;
  user_id: string;
  team_id?: string;
  user_name?: string;
  user_email?: string;
  connected_at: string;
};

const VERCEL_API_BASE = "https://api.vercel.com";

export class VercelOAuthNotConfiguredError extends Error {
  constructor() {
    super(
      "Vercel OAuth is not configured. Set VERCEL_OAUTH_CLIENT_ID, " +
        "VERCEL_OAUTH_CLIENT_SECRET, VERCEL_OAUTH_REDIRECT_URI, and " +
        "VERCEL_INTEGRATION_SLUG in backend .env.",
    );
    this.name = "VercelOAuthNotConfiguredError";
  }
}

export function getVercelOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  integrationSlug: string;
} {
  const {
    VERCEL_OAUTH_CLIENT_ID,
    VERCEL_OAUTH_CLIENT_SECRET,
    VERCEL_OAUTH_REDIRECT_URI,
    VERCEL_INTEGRATION_SLUG,
  } = env;
  if (
    !VERCEL_OAUTH_CLIENT_ID ||
    !VERCEL_OAUTH_CLIENT_SECRET ||
    !VERCEL_OAUTH_REDIRECT_URI ||
    !VERCEL_INTEGRATION_SLUG
  ) {
    throw new VercelOAuthNotConfiguredError();
  }
  return {
    clientId: VERCEL_OAUTH_CLIENT_ID,
    clientSecret: VERCEL_OAUTH_CLIENT_SECRET,
    redirectUri: VERCEL_OAUTH_REDIRECT_URI,
    integrationSlug: VERCEL_INTEGRATION_SLUG,
  };
}

export function buildVercelInstallUrl(state: string): string {
  const { integrationSlug } = getVercelOAuthConfig();
  const url = new URL(`https://vercel.com/integrations/${integrationSlug}/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

type VercelTokenResponse = {
  token_type: string;
  access_token: string;
  installation_id: string;
  user_id: string;
  team_id?: string;
};

export async function exchangeVercelCode(params: {
  code: string;
}): Promise<VercelTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getVercelOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: params.code,
    redirect_uri: redirectUri,
  });
  const resp = await fetch(`${VERCEL_API_BASE}/v2/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Vercel token exchange failed (${resp.status}): ${text}`);
  }
  return (await resp.json()) as VercelTokenResponse;
}

type VercelUserResponse = {
  user: {
    id: string;
    username: string;
    email: string;
    name?: string;
  };
};

type VercelTeamResponse = {
  id: string;
  slug: string;
  name: string;
};

export async function fetchVercelIdentity(
  accessToken: string,
  teamId?: string,
): Promise<{ user_name: string; user_email: string }> {
  if (teamId) {
    const resp = await vercelFetch(`/v2/teams/${teamId}`, accessToken);
    const team = (await resp.json()) as VercelTeamResponse;
    return { user_name: team.name || team.slug, user_email: "" };
  }
  const resp = await vercelFetch("/v2/user", accessToken);
  const { user } = (await resp.json()) as VercelUserResponse;
  return { user_name: user.username || user.name || user.email, user_email: user.email };
}

async function vercelFetch(path: string, accessToken: string): Promise<Response> {
  const resp = await fetch(`${VERCEL_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Vercel API ${path} failed (${resp.status}): ${text}`);
  }
  return resp;
}

export async function getStoredVercelToken(userId: string): Promise<VercelOAuthToken | null> {
  return readEncryptedSetting<VercelOAuthToken>(userId, SETTINGS_KEY_VERCEL_OAUTH);
}

export async function storeVercelToken(userId: string, token: VercelOAuthToken): Promise<void> {
  await writeEncryptedSetting<VercelOAuthToken>(userId, SETTINGS_KEY_VERCEL_OAUTH, token);
}

export async function deleteStoredVercelToken(userId: string): Promise<void> {
  await deleteEncryptedSetting(userId, SETTINGS_KEY_VERCEL_OAUTH);
}
