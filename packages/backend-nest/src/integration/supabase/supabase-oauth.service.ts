import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import {
  OAuthTokenRepository,
  SETTINGS_KEY_SUPABASE_OAUTH,
} from "../oauth-token.repository.js";

export interface SupabaseOAuthToken {
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
}

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface SupabaseOrg {
  id: string;
  name: string;
  slug?: string;
}

export class SupabaseOAuthNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase OAuth is not configured. Set SUPABASE_OAUTH_CLIENT_ID, " +
        "SUPABASE_OAUTH_CLIENT_SECRET, and SUPABASE_OAUTH_REDIRECT_URI in backend .env.",
    );
    this.name = "SupabaseOAuthNotConfiguredError";
  }
}

const SUPABASE_API_BASE = "https://api.supabase.com";
// "all" maps to every permission enabled on the OAuth App Dashboard config —
// keep that in sync with the endpoints we actually hit.
const DEFAULT_OAUTH_SCOPE = "all";

@Injectable()
export class SupabaseOAuthService {
  constructor(
    private readonly cfg: ConfigService<Env, true>,
    private readonly tokenRepo: OAuthTokenRepository,
  ) {}

  private requireConfig() {
    const clientId = this.cfg.get("SUPABASE_OAUTH_CLIENT_ID", { infer: true });
    const clientSecret = this.cfg.get("SUPABASE_OAUTH_CLIENT_SECRET", { infer: true });
    const redirectUri = this.cfg.get("SUPABASE_OAUTH_REDIRECT_URI", { infer: true });
    if (!clientId || !clientSecret || !redirectUri) {
      throw new SupabaseOAuthNotConfiguredError();
    }
    return { clientId, clientSecret, redirectUri, scope: DEFAULT_OAUTH_SCOPE };
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId, redirectUri, scope } = this.requireConfig();
    const url = new URL(`${SUPABASE_API_BASE}/v1/oauth/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    if (scope) url.searchParams.set("scope", scope);
    return url.toString();
  }

  private async postTokenEndpoint(body: URLSearchParams): Promise<SupabaseTokenResponse> {
    const { clientId, clientSecret } = this.requireConfig();
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
      throw new InternalServerErrorException(`Supabase token endpoint failed (${resp.status}): ${text}`);
    }
    return (await resp.json()) as SupabaseTokenResponse;
  }

  async exchangeCode(code: string): Promise<SupabaseTokenResponse> {
    const { redirectUri } = this.requireConfig();
    return this.postTokenEndpoint(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    );
  }

  async fetchIdentity(
    accessToken: string,
  ): Promise<{ org_id?: string; org_name?: string; org_slug?: string }> {
    const resp = await fetch(`${SUPABASE_API_BASE}/v1/organizations`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new InternalServerErrorException(`Supabase /organizations failed (${resp.status}): ${text}`);
    }
    const orgs = (await resp.json()) as SupabaseOrg[];
    const first = orgs[0];
    if (!first) return {};
    return { org_id: first.id, org_name: first.name, org_slug: first.slug };
  }

  tokenFromExchangeResponse(
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

  async getToken(userId: string): Promise<SupabaseOAuthToken | null> {
    return this.tokenRepo.readEncrypted<SupabaseOAuthToken>(userId, SETTINGS_KEY_SUPABASE_OAUTH);
  }

  async storeToken(userId: string, token: SupabaseOAuthToken): Promise<void> {
    await this.tokenRepo.writeEncrypted(userId, SETTINGS_KEY_SUPABASE_OAUTH, token);
  }

  async deleteToken(userId: string): Promise<void> {
    await this.tokenRepo.deleteByKey(userId, SETTINGS_KEY_SUPABASE_OAUTH);
  }
}
