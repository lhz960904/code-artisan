import { randomBytes } from "node:crypto";
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

const PROJECT_POLL_INTERVAL_MS = 3_000;
const PROJECT_POLL_TIMEOUT_MS = 90_000;
const DEFAULT_PROJECT_REGION = "us-east-1";

export class SupabaseManagementApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    public readonly bodyText: string,
  ) {
    super(`Supabase Management API ${endpoint} failed (${status}): ${bodyText}`);
    this.name = "SupabaseManagementApiError";
  }
}

export class SupabaseProjectProvisionTimeoutError extends Error {
  constructor(
    public readonly projectRef: string,
    public readonly lastStatus: string,
  ) {
    super(
      `Supabase project ${projectRef} did not reach ACTIVE_HEALTHY within ${PROJECT_POLL_TIMEOUT_MS}ms (last status: ${lastStatus}).`,
    );
    this.name = "SupabaseProjectProvisionTimeoutError";
  }
}

export class SupabaseProjectInitFailedError extends Error {
  constructor(public readonly projectRef: string) {
    super(`Supabase project ${projectRef} reported INIT_FAILED.`);
    this.name = "SupabaseProjectInitFailedError";
  }
}

async function managementFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers as HeadersInit | undefined);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${SUPABASE_API_BASE}${path}`, { ...init, headers });
}

async function managementJson<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const resp = await managementFetch(accessToken, path, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new SupabaseManagementApiError(resp.status, path, text);
  }
  return (await resp.json()) as T;
}

export type SupabaseProjectStatus =
  | "ACTIVE_HEALTHY"
  | "COMING_UP"
  | "GOING_DOWN"
  | "INACTIVE"
  | "INIT_FAILED"
  | "PAUSED"
  | "PAUSING"
  | "REMOVED"
  | "RESTARTING"
  | "RESTORING"
  | "UPGRADING"
  | "UNKNOWN"
  | (string & {});

export interface SupabaseProject {
  id: string;
  ref?: string;
  name: string;
  organization_id: string;
  region: string;
  status: SupabaseProjectStatus;
  endpoint?: string;
  database?: { host: string; version: string };
  created_at?: string;
}

function projectUrlFromRef(ref: string): string {
  return `https://${ref}.supabase.co`;
}

function generateDbPassword(): string {
  return randomBytes(18).toString("base64url");
}

export interface CreateSupabaseProjectParams {
  userId: string;
  name: string;
  orgId: string;
  region?: string;
}

export interface CreateSupabaseProjectResult {
  ref: string;
  url: string;
  region: string;
  organizationId: string;
}

export async function createSupabaseProject(
  params: CreateSupabaseProjectParams,
): Promise<CreateSupabaseProjectResult> {
  const accessToken = await getValidSupabaseAccessToken(params.userId);
  const region = params.region ?? DEFAULT_PROJECT_REGION;
  const dbPass = generateDbPassword();

  const created = await managementJson<SupabaseProject>(accessToken, "/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      organization_id: params.orgId,
      region,
      db_pass: dbPass,
    }),
  });

  const ref = created.ref ?? created.id;
  await pollUntilProjectHealthy({ userId: params.userId, projectRef: ref });

  return {
    ref,
    url: projectUrlFromRef(ref),
    region,
    organizationId: params.orgId,
  };
}

export interface ProjectRefParams {
  userId: string;
  projectRef: string;
}

export async function getSupabaseProject(params: ProjectRefParams): Promise<SupabaseProject> {
  const accessToken = await getValidSupabaseAccessToken(params.userId);
  return managementJson<SupabaseProject>(accessToken, `/v1/projects/${params.projectRef}`);
}

async function pollUntilProjectHealthy(params: ProjectRefParams): Promise<void> {
  const startedAt = Date.now();
  let lastStatus = "UNKNOWN";
  while (Date.now() - startedAt < PROJECT_POLL_TIMEOUT_MS) {
    let project: SupabaseProject | null = null;
    try {
      project = await getSupabaseProject(params);
    } catch (err) {
      // Just-created projects may briefly 404 before they appear in the read API.
      if (!(err instanceof SupabaseManagementApiError) || err.status !== 404) throw err;
    }
    if (project) {
      lastStatus = project.status;
      if (project.status === "ACTIVE_HEALTHY") return;
      if (project.status === "INIT_FAILED") {
        throw new SupabaseProjectInitFailedError(params.projectRef);
      }
    }
    await new Promise((r) => setTimeout(r, PROJECT_POLL_INTERVAL_MS));
  }
  throw new SupabaseProjectProvisionTimeoutError(params.projectRef, lastStatus);
}

interface SupabaseApiKey {
  name: string;
  api_key: string;
}

export interface SupabaseProjectKeys {
  anonKey: string;
  serviceRoleKey: string;
}

export async function getSupabaseProjectKeys(
  params: ProjectRefParams,
): Promise<SupabaseProjectKeys> {
  const accessToken = await getValidSupabaseAccessToken(params.userId);
  const keys = await managementJson<SupabaseApiKey[]>(
    accessToken,
    `/v1/projects/${params.projectRef}/api-keys`,
  );
  const anon = keys.find((k) => k.name === "anon")?.api_key;
  const serviceRole = keys.find((k) => k.name === "service_role")?.api_key;
  if (!anon || !serviceRole) {
    throw new Error(
      `Supabase project ${params.projectRef} api-keys missing (got: ${keys.map((k) => k.name).join(", ") || "none"}).`,
    );
  }
  return { anonKey: anon, serviceRoleKey: serviceRole };
}

export interface RunSupabaseSqlParams {
  userId: string;
  projectRef: string;
  query: string;
}

export type SupabaseSqlRow = Record<string, unknown>;

export async function runSupabaseSql(params: RunSupabaseSqlParams): Promise<SupabaseSqlRow[]> {
  const accessToken = await getValidSupabaseAccessToken(params.userId);
  return managementJson<SupabaseSqlRow[]>(
    accessToken,
    `/v1/projects/${params.projectRef}/database/query`,
    {
      method: "POST",
      body: JSON.stringify({ query: params.query }),
    },
  );
}

export async function listSupabaseOrganizations(userId: string): Promise<SupabaseOrg[]> {
  const accessToken = await getValidSupabaseAccessToken(userId);
  return managementJson<SupabaseOrg[]>(accessToken, "/v1/organizations");
}
