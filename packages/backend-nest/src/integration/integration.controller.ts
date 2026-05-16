import "@fastify/cookie";
import {
  Controller,
  Delete,
  Get,
  Logger,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { OAuthCallbackQueryDto } from "./dto/oauth-callback.dto.js";
import {
  SupabaseOAuthNotConfiguredError,
  SupabaseOAuthService,
} from "./supabase/supabase-oauth.service.js";
import {
  VercelOAuthNotConfiguredError,
  VercelOAuthService,
} from "./vercel/vercel-oauth.service.js";

const VERCEL_STATE_COOKIE = "vercel_oauth_state";
const SUPABASE_STATE_COOKIE = "supabase_oauth_state";
const STATE_TTL_SECONDS = 600;
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: STATE_TTL_SECONDS,
};

function returnUrl(integration: "vercel" | "supabase", status: string): string {
  return `/oauth/return?integration=${integration}&status=${status}`;
}

@Controller("integration")
export class IntegrationController {
  private readonly logger = new Logger(IntegrationController.name);

  constructor(
    private readonly vercelOAuth: VercelOAuthService,
    private readonly supabaseOAuth: SupabaseOAuthService,
  ) {}

  @Get("vercel")
  async vercelStatus(@CurrentUser() user: AuthUser) {
    const token = await this.vercelOAuth.getToken(user.id);
    if (!token) return { connected: false };
    return {
      connected: true,
      user_name: token.user_name,
      user_email: token.user_email,
      team_id: token.team_id,
      connected_at: token.connected_at,
    };
  }

  @Get("vercel/connect")
  async vercelConnect(@Res() reply: FastifyReply) {
    try {
      const state = randomUUID();
      reply.setCookie(VERCEL_STATE_COOKIE, state, COOKIE_OPTS);
      reply.redirect(this.vercelOAuth.buildInstallUrl(state));
    } catch (err) {
      if (err instanceof VercelOAuthNotConfiguredError) {
        reply.redirect(returnUrl("vercel", "not-configured"));
        return;
      }
      throw err;
    }
  }

  @Get("vercel/callback")
  async vercelCallback(
    @CurrentUser() user: AuthUser,
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const cookieState = req.cookies[VERCEL_STATE_COOKIE];
    reply.clearCookie(VERCEL_STATE_COOKIE, { path: "/" });

    if (query.error) {
      reply.redirect(returnUrl("vercel", "denied"));
      return;
    }
    if (!query.code) {
      reply.redirect(returnUrl("vercel", "missing-code"));
      return;
    }
    if (!query.state || !cookieState || query.state !== cookieState) {
      reply.redirect(returnUrl("vercel", "invalid-state"));
      return;
    }

    try {
      const tokenResp = await this.vercelOAuth.exchangeCode(query.code);
      const identity = await this.vercelOAuth.fetchIdentity(tokenResp.access_token, tokenResp.team_id);
      await this.vercelOAuth.storeToken(user.id, {
        access_token: tokenResp.access_token,
        installation_id: tokenResp.installation_id,
        user_id: tokenResp.user_id,
        team_id: tokenResp.team_id,
        user_name: identity.user_name,
        user_email: identity.user_email,
        connected_at: new Date().toISOString(),
      });
      reply.redirect(returnUrl("vercel", "connected"));
    } catch (err) {
      this.logger.error("vercel callback failed", err instanceof Error ? err.stack : String(err));
      reply.redirect(returnUrl("vercel", "error"));
    }
  }

  @Delete("vercel")
  async vercelDisconnect(@CurrentUser() user: AuthUser) {
    await this.vercelOAuth.deleteToken(user.id);
    return { disconnected: true };
  }

  @Get("supabase")
  async supabaseStatus(@CurrentUser() user: AuthUser) {
    const token = await this.supabaseOAuth.getToken(user.id);
    if (!token) return { connected: false };
    return {
      connected: true,
      org_id: token.org_id,
      org_name: token.org_name,
      org_slug: token.org_slug,
      connected_at: token.connected_at,
    };
  }

  @Get("supabase/connect")
  async supabaseConnect(@Res() reply: FastifyReply) {
    try {
      const state = randomUUID();
      reply.setCookie(SUPABASE_STATE_COOKIE, state, COOKIE_OPTS);
      reply.redirect(this.supabaseOAuth.buildAuthorizeUrl(state));
    } catch (err) {
      if (err instanceof SupabaseOAuthNotConfiguredError) {
        reply.redirect(returnUrl("supabase", "not-configured"));
        return;
      }
      throw err;
    }
  }

  @Get("supabase/callback")
  async supabaseCallback(
    @CurrentUser() user: AuthUser,
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const cookieState = req.cookies[SUPABASE_STATE_COOKIE];
    reply.clearCookie(SUPABASE_STATE_COOKIE, { path: "/" });

    if (query.error) {
      reply.redirect(returnUrl("supabase", "denied"));
      return;
    }
    if (!query.code) {
      reply.redirect(returnUrl("supabase", "missing-code"));
      return;
    }
    if (!query.state || !cookieState || query.state !== cookieState) {
      reply.redirect(returnUrl("supabase", "invalid-state"));
      return;
    }

    try {
      const tokenResp = await this.supabaseOAuth.exchangeCode(query.code);
      const identity = await this.supabaseOAuth.fetchIdentity(tokenResp.access_token);
      const token = this.supabaseOAuth.tokenFromExchangeResponse(tokenResp, identity);
      await this.supabaseOAuth.storeToken(user.id, token);
      reply.redirect(returnUrl("supabase", "connected"));
    } catch (err) {
      this.logger.error("supabase callback failed", err instanceof Error ? err.stack : String(err));
      reply.redirect(returnUrl("supabase", "error"));
    }
  }

  @Delete("supabase")
  async supabaseDisconnect(@CurrentUser() user: AuthUser) {
    await this.supabaseOAuth.deleteToken(user.id);
    return { disconnected: true };
  }
}
