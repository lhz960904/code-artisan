import { HttpStatus, Injectable } from "@nestjs/common";
import { DomainException } from "../../common/exceptions/domain.exception.js";
import { VercelOAuthService, type VercelOAuthToken } from "./vercel-oauth.service.js";

const VERCEL_API_BASE = "https://api.vercel.com";

export interface VercelProject {
  id: string;
  name: string;
  framework?: string | null;
}

export class VercelTokenInvalidError extends Error {
  constructor() {
    super("Vercel token is invalid (uninstalled / revoked). Reconnect required.");
    this.name = "VercelTokenInvalidError";
  }
}

@Injectable()
export class VercelProjectService {
  constructor(private readonly oauth: VercelOAuthService) {}

  // Looks up the user's stored token (caller already validated they're connected).
  // Returns the token row so caller can read team_id / installation_id too.
  async requireToken(userId: string): Promise<VercelOAuthToken> {
    const token = await this.oauth.getToken(userId);
    if (!token) {
      throw new DomainException(
        "Connect your Vercel account in Settings → Integrations first.",
        HttpStatus.BAD_REQUEST,
        "VERCEL_NOT_CONNECTED",
      );
    }
    return token;
  }

  async createProject(params: {
    accessToken: string;
    userId: string;
    teamId?: string;
    name: string;
  }): Promise<VercelProject> {
    const query = params.teamId ? `?teamId=${encodeURIComponent(params.teamId)}` : "";
    const resp = await this.vercelFetch(`/v9/projects${query}`, params.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: params.name, framework: "vite" }),
      userId: params.userId,
    });
    return (await resp.json()) as VercelProject;
  }

  async getProject(params: {
    accessToken: string;
    userId: string;
    teamId?: string;
    projectId: string;
  }): Promise<VercelProject | null> {
    const query = params.teamId ? `?teamId=${encodeURIComponent(params.teamId)}` : "";
    const resp = await fetch(`${VERCEL_API_BASE}/v9/projects/${params.projectId}${query}`, {
      headers: { authorization: `Bearer ${params.accessToken}` },
    });
    if (resp.status === 404) return null;
    if (resp.status === 401 || resp.status === 403) {
      await this.oauth.deleteToken(params.userId);
      throw new VercelTokenInvalidError();
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Vercel getProject failed (${resp.status}): ${text}`);
    }
    return (await resp.json()) as VercelProject;
  }

  async upsertProjectEnv(params: {
    accessToken: string;
    userId: string;
    teamId?: string;
    projectId: string;
    vars: Array<{ key: string; value: string }>;
  }): Promise<void> {
    if (params.vars.length === 0) return;
    const query = new URLSearchParams({ upsert: "true" });
    if (params.teamId) query.set("teamId", params.teamId);
    const body = params.vars.map((v) => ({
      key: v.key,
      value: v.value,
      type: "encrypted" as const,
      target: ["production", "preview"] as const,
    }));
    await this.vercelFetch(`/v10/projects/${params.projectId}/env?${query}`, params.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      userId: params.userId,
    });
  }

  // 401/403 from Vercel = the user uninstalled the integration or revoked the
  // token. Clear our copy and surface a typed error so callers can drive a
  // reconnect prompt.
  private async vercelFetch(
    path: string,
    accessToken: string,
    init: RequestInit & { userId: string },
  ): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      ...((init.headers as Record<string, string>) ?? {}),
    };
    const resp = await fetch(`${VERCEL_API_BASE}${path}`, { ...init, headers });
    if (resp.status === 401 || resp.status === 403) {
      await this.oauth.deleteToken(init.userId);
      throw new VercelTokenInvalidError();
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Vercel API ${path} failed (${resp.status}): ${text}`);
    }
    return resp;
  }
}
