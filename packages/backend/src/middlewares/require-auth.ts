import type { Context, MiddlewareHandler } from "hono";
import { auth, type AuthUser, type AuthSession } from "../auth.js";
import { unauthorized } from "../http/index.js";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
    session: AuthSession;
  }
}

export const requireAuth: MiddlewareHandler = async (c: Context, next) => {
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s) return unauthorized(c);
  c.set("user", s.user);
  c.set("session", s.session);
  await next();
};
