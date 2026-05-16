import { HttpStatus, Injectable } from "@nestjs/common";
import { DomainException } from "../../common/exceptions/domain.exception.js";
import {
  SupabaseNotConnectedError,
  SupabaseOAuthService,
  SupabaseTokenInvalidError,
} from "./supabase-oauth.service.js";

const SUPABASE_API_BASE = "https://api.supabase.com";

export type SupabaseSqlRow = Record<string, unknown>;

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

@Injectable()
export class SupabaseManagementService {
  constructor(private readonly oauth: SupabaseOAuthService) {}

  async runSql(userId: string, projectRef: string, query: string): Promise<SupabaseSqlRow[]> {
    const accessToken = await this.requireAccessToken(userId);
    return this.managementJson<SupabaseSqlRow[]>(
      accessToken,
      `/v1/projects/${projectRef}/database/query`,
      { method: "POST", body: JSON.stringify({ query }) },
    );
  }

  // Translates oauth-layer Errors into transport-shaped DomainExceptions so
  // controllers can rely on the filter to render a clean envelope.
  private async requireAccessToken(userId: string): Promise<string> {
    try {
      return await this.oauth.getValidAccessToken(userId);
    } catch (err) {
      if (err instanceof SupabaseNotConnectedError) {
        throw new DomainException(err.message, HttpStatus.BAD_REQUEST, "SUPABASE_NOT_CONNECTED");
      }
      if (err instanceof SupabaseTokenInvalidError) {
        throw new DomainException(err.message, HttpStatus.UNAUTHORIZED, "SUPABASE_TOKEN_INVALID");
      }
      throw err;
    }
  }

  private async managementJson<T>(
    accessToken: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers as HeadersInit | undefined);
    headers.set("authorization", `Bearer ${accessToken}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const resp = await fetch(`${SUPABASE_API_BASE}${path}`, { ...init, headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new SupabaseManagementApiError(resp.status, path, text);
    }
    return (await resp.json()) as T;
  }
}
