import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import {
  OAuthTokenRepository,
  SETTINGS_KEY_VERCEL_OAUTH,
} from "../oauth-token.repository.js";

export interface VercelOAuthToken {
  access_token: string;
  installation_id: string;
  user_id: string;
  team_id?: string;
  user_name?: string;
  user_email?: string;
  connected_at: string;
}

interface VercelTokenResponse {
  token_type: string;
  access_token: string;
  installation_id: string;
  user_id: string;
  team_id?: string;
}

interface VercelUserResponse {
  user: { id: string; username: string; email: string; name?: string };
}

interface VercelTeamResponse {
  id: string;
  slug: string;
  name: string;
}

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

const VERCEL_API_BASE = "https://api.vercel.com";

@Injectable()
export class VercelOAuthService {
  constructor(
    private readonly cfg: ConfigService<Env, true>,
    private readonly tokenRepo: OAuthTokenRepository,
  ) {}

  private requireConfig() {
    const clientId = this.cfg.get("VERCEL_OAUTH_CLIENT_ID", { infer: true });
    const clientSecret = this.cfg.get("VERCEL_OAUTH_CLIENT_SECRET", { infer: true });
    const redirectUri = this.cfg.get("VERCEL_OAUTH_REDIRECT_URI", { infer: true });
    const integrationSlug = this.cfg.get("VERCEL_INTEGRATION_SLUG", { infer: true });
    if (!clientId || !clientSecret || !redirectUri || !integrationSlug) {
      throw new VercelOAuthNotConfiguredError();
    }
    return { clientId, clientSecret, redirectUri, integrationSlug };
  }

  buildInstallUrl(state: string): string {
    const { integrationSlug } = this.requireConfig();
    const url = new URL(`https://vercel.com/integrations/${integrationSlug}/new`);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<VercelTokenResponse> {
    const { clientId, clientSecret, redirectUri } = this.requireConfig();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    const resp = await fetch(`${VERCEL_API_BASE}/v2/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new InternalServerErrorException(`Vercel token exchange failed (${resp.status}): ${text}`);
    }
    return (await resp.json()) as VercelTokenResponse;
  }

  async fetchIdentity(
    accessToken: string,
    teamId?: string,
  ): Promise<{ user_name: string; user_email: string }> {
    if (teamId) {
      const resp = await this.vercelFetch(`/v2/teams/${teamId}`, accessToken);
      const team = (await resp.json()) as VercelTeamResponse;
      return { user_name: team.name || team.slug, user_email: "" };
    }
    const resp = await this.vercelFetch("/v2/user", accessToken);
    const { user } = (await resp.json()) as VercelUserResponse;
    return { user_name: user.username || user.name || user.email, user_email: user.email };
  }

  private async vercelFetch(path: string, accessToken: string): Promise<Response> {
    const resp = await fetch(`${VERCEL_API_BASE}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new InternalServerErrorException(`Vercel API ${path} failed (${resp.status}): ${text}`);
    }
    return resp;
  }

  async getToken(userId: string): Promise<VercelOAuthToken | null> {
    return this.tokenRepo.readEncrypted<VercelOAuthToken>(userId, SETTINGS_KEY_VERCEL_OAUTH);
  }

  async storeToken(userId: string, token: VercelOAuthToken): Promise<void> {
    await this.tokenRepo.writeEncrypted(userId, SETTINGS_KEY_VERCEL_OAUTH, token);
  }

  async deleteToken(userId: string): Promise<void> {
    await this.tokenRepo.deleteByKey(userId, SETTINGS_KEY_VERCEL_OAUTH);
  }
}
