import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { ok, validate } from "../http/index.js";
import {
  VercelOAuthNotConfiguredError,
  buildVercelInstallUrl,
  deleteStoredVercelToken,
  exchangeVercelCode,
  fetchVercelIdentity,
  getStoredVercelToken,
  storeVercelToken,
} from "../services/integration/vercel-client.js";
import {
  SupabaseOAuthNotConfiguredError,
  buildSupabaseAuthorizeUrl,
  deleteStoredSupabaseToken,
  exchangeSupabaseCode,
  fetchSupabaseIdentity,
  getStoredSupabaseToken,
  storeSupabaseToken,
  tokenFromExchangeResponse,
} from "../services/integration/supabase-client.js";

const VERCEL_STATE_COOKIE = "vercel_oauth_state";
const SUPABASE_STATE_COOKIE = "supabase_oauth_state";
const STATE_TTL_SECONDS = 600;

const integrationRouter = new Hono();

integrationRouter.get("/vercel", async (c) => {
  const user = c.get("user");
  const token = await getStoredVercelToken(user.id);
  if (!token) return ok(c, { connected: false });
  return ok(c, {
    connected: true,
    user_name: token.user_name,
    user_email: token.user_email,
    team_id: token.team_id,
    connected_at: token.connected_at,
  });
});

integrationRouter.get("/vercel/connect", async (c) => {
  try {
    const state = crypto.randomUUID();
    setCookie(c, VERCEL_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });
    return c.redirect(buildVercelInstallUrl(state));
  } catch (err) {
    if (err instanceof VercelOAuthNotConfiguredError) {
      return c.redirect("/oauth/return?integration=vercel&status=not-configured");
    }
    throw err;
  }
});

integrationRouter.get(
  "/vercel/callback",
  validate(
    "query",
    z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const { code, state, error } = c.req.valid("query");
    const cookieState = getCookie(c, VERCEL_STATE_COOKIE);
    deleteCookie(c, VERCEL_STATE_COOKIE, { path: "/" });

    if (error) return c.redirect(`/oauth/return?integration=vercel&status=denied`);
    if (!code) return c.redirect(`/oauth/return?integration=vercel&status=missing-code`);
    if (!state || !cookieState || state !== cookieState) {
      return c.redirect(`/oauth/return?integration=vercel&status=invalid-state`);
    }

    try {
      const tokenResp = await exchangeVercelCode({ code });
      const identity = await fetchVercelIdentity(tokenResp.access_token, tokenResp.team_id);
      await storeVercelToken(user.id, {
        access_token: tokenResp.access_token,
        installation_id: tokenResp.installation_id,
        user_id: tokenResp.user_id,
        team_id: tokenResp.team_id,
        user_name: identity.user_name,
        user_email: identity.user_email,
        connected_at: new Date().toISOString(),
      });
      return c.redirect(`/oauth/return?integration=vercel&status=connected`);
    } catch (err) {
      console.error("[integration/vercel/callback]", err);
      return c.redirect(`/oauth/return?integration=vercel&status=error`);
    }
  },
);

integrationRouter.delete("/vercel", async (c) => {
  const user = c.get("user");
  await deleteStoredVercelToken(user.id);
  return ok(c, { disconnected: true });
});

integrationRouter.get("/supabase", async (c) => {
  const user = c.get("user");
  const token = await getStoredSupabaseToken(user.id);
  if (!token) return ok(c, { connected: false });
  return ok(c, {
    connected: true,
    org_id: token.org_id,
    org_name: token.org_name,
    org_slug: token.org_slug,
    connected_at: token.connected_at,
  });
});

integrationRouter.get("/supabase/connect", async (c) => {
  try {
    const state = crypto.randomUUID();
    setCookie(c, SUPABASE_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });
    return c.redirect(buildSupabaseAuthorizeUrl(state));
  } catch (err) {
    if (err instanceof SupabaseOAuthNotConfiguredError) {
      return c.redirect("/oauth/return?integration=supabase&status=not-configured");
    }
    throw err;
  }
});

integrationRouter.get(
  "/supabase/callback",
  validate(
    "query",
    z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const { code, state, error } = c.req.valid("query");
    const cookieState = getCookie(c, SUPABASE_STATE_COOKIE);
    deleteCookie(c, SUPABASE_STATE_COOKIE, { path: "/" });

    if (error) return c.redirect(`/oauth/return?integration=supabase&status=denied`);
    if (!code) return c.redirect(`/oauth/return?integration=supabase&status=missing-code`);
    if (!state || !cookieState || state !== cookieState) {
      return c.redirect(`/oauth/return?integration=supabase&status=invalid-state`);
    }

    try {
      const tokenResp = await exchangeSupabaseCode({ code });
      const identity = await fetchSupabaseIdentity(tokenResp.access_token);
      await storeSupabaseToken(user.id, tokenFromExchangeResponse(tokenResp, identity));
      return c.redirect(`/oauth/return?integration=supabase&status=connected`);
    } catch (err) {
      console.error("[integration/supabase/callback]", err);
      return c.redirect(`/oauth/return?integration=supabase&status=error`);
    }
  },
);

integrationRouter.delete("/supabase", async (c) => {
  const user = c.get("user");
  await deleteStoredSupabaseToken(user.id);
  return ok(c, { disconnected: true });
});

export { integrationRouter };
