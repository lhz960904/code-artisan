import { env } from "../../env.js";
import {
  SETTINGS_KEY_SUPABASE_OAUTH,
  deleteEncryptedSetting,
  readEncryptedSetting,
  writeEncryptedSetting,
} from "./oauth-storage.js";

export type SupabaseOAuthToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope?: string;
  org_id?: string;
  org_name?: string;
  org_slug?: string;
  user_email?: string;
  connected_at: string;
};

const SUPABASE_API_BASE = "https://api.supabase.com";
const REFRESH_SKEW_MS = 60_000;

export class SupabaseOAuthNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase OAuth is not configured. Set SUPABASE_OAUTH_CLIENT_ID, " +
        "SUPABASE_OAUTH_CLIENT_SECRET, and SUPABASE_OAUTH_REDIRECT_URI in backend .env.",
    );
    this.name = "SupabaseOAuthNotConfiguredError";
  }
}

export class SupabaseTokenInvalidError extends Error {
  constructor() {
    super("Supabase token is invalid (revoked / refresh failed). Reconnect required.");
    this.name = "SupabaseTokenInvalidError";
  }
}

export class SupabaseNotConnectedError extends Error {
  constructor() {
    super("User has not connected their Supabase account.");
    this.name = "SupabaseNotConnectedError";
  }
}

export function getSupabaseOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
} {
  const {
    SUPABASE_OAUTH_CLIENT_ID,
    SUPABASE_OAUTH_CLIENT_SECRET,
    SUPABASE_OAUTH_REDIRECT_URI,
    SUPABASE_OAUTH_SCOPE,
  } = env;
  if (!SUPABASE_OAUTH_CLIENT_ID || !SUPABASE_OAUTH_CLIENT_SECRET || !SUPABASE_OAUTH_REDIRECT_URI) {
    throw new SupabaseOAuthNotConfiguredError();
  }
  return {
    clientId: SUPABASE_OAUTH_CLIENT_ID,
    clientSecret: SUPABASE_OAUTH_CLIENT_SECRET,
    redirectUri: SUPABASE_OAUTH_REDIRECT_URI,
    scope: SUPABASE_OAUTH_SCOPE ?? "all",
  };
}

export function buildSupabaseAuthorizeUrl(state: string): string {
  const { clientId, redirectUri, scope } = getSupabaseOAuthConfig();
  const url = new URL(`${SUPABASE_API_BASE}/v1/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (scope) url.searchParams.set("scope", scope);
  return url.toString();
}

type SupabaseTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

async function postTokenEndpoint(body: URLSearchParams): Promise<SupabaseTokenResponse> {
  const { clientId, clientSecret } = getSupabaseOAuthConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(`${SUPABASE_API_BASE}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Supabase token endpoint failed (${resp.status}): ${text}`);
  }
  return (await resp.json()) as SupabaseTokenResponse;
}

export async function exchangeSupabaseCode(params: {
  code: string;
}): Promise<SupabaseTokenResponse> {
  const { redirectUri } = getSupabaseOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: redirectUri,
  });
  return postTokenEndpoint(body);
}

export async function refreshSupabaseToken(params: {
  refreshToken: string;
}): Promise<SupabaseTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });
  return postTokenEndpoint(body);
}

type SupabaseOrg = {
  id: string;
  name: string;
  slug?: string;
};

export async function fetchSupabaseIdentity(
  accessToken: string,
): Promise<{ org_id?: string; org_name?: string; org_slug?: string }> {
  const resp = await fetch(`${SUPABASE_API_BASE}/v1/organizations`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Supabase /organizations failed (${resp.status}): ${text}`);
  }
  const orgs = (await resp.json()) as SupabaseOrg[];
  const first = orgs[0];
  if (!first) return {};
  return { org_id: first.id, org_name: first.name, org_slug: first.slug };
}

export async function getStoredSupabaseToken(
  userId: string,
): Promise<SupabaseOAuthToken | null> {
  return readEncryptedSetting<SupabaseOAuthToken>(userId, SETTINGS_KEY_SUPABASE_OAUTH);
}

export async function storeSupabaseToken(
  userId: string,
  token: SupabaseOAuthToken,
): Promise<void> {
  await writeEncryptedSetting<SupabaseOAuthToken>(userId, SETTINGS_KEY_SUPABASE_OAUTH, token);
}

export async function deleteStoredSupabaseToken(userId: string): Promise<void> {
  await deleteEncryptedSetting(userId, SETTINGS_KEY_SUPABASE_OAUTH);
}

export function tokenFromExchangeResponse(
  resp: SupabaseTokenResponse,
  identity: { org_id?: string; org_name?: string; org_slug?: string },
  previous?: SupabaseOAuthToken,
): SupabaseOAuthToken {
  return {
    access_token: resp.access_token,
    refresh_token: resp.refresh_token,
    expires_at: Date.now() + resp.expires_in * 1000,
    token_type: resp.token_type,
    scope: resp.scope,
    org_id: identity.org_id ?? previous?.org_id,
    org_name: identity.org_name ?? previous?.org_name,
    org_slug: identity.org_slug ?? previous?.org_slug,
    user_email: previous?.user_email,
    connected_at: previous?.connected_at ?? new Date().toISOString(),
  };
}

export async function getValidSupabaseAccessToken(userId: string): Promise<string> {
  const stored = await getStoredSupabaseToken(userId);
  if (!stored) throw new SupabaseNotConnectedError();
  if (stored.expires_at - REFRESH_SKEW_MS > Date.now()) return stored.access_token;
  try {
    const refreshed = await refreshSupabaseToken({ refreshToken: stored.refresh_token });
    const next = tokenFromExchangeResponse(refreshed, {}, stored);
    await storeSupabaseToken(userId, next);
    return next.access_token;
  } catch (err) {
    await deleteStoredSupabaseToken(userId);
    throw new SupabaseTokenInvalidError();
  }
}
