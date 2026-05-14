import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AUTH, type Auth, type AuthSession, type AuthUser } from "./auth.provider.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
    session?: AuthSession;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const headers = toFetchHeaders(req.headers);
    const result = await this.auth.api.getSession({ headers });
    if (!result) throw new UnauthorizedException("Unauthorized");
    req.user = result.user;
    req.session = result.session;
    return true;
  }
}

function toFetchHeaders(input: FastifyRequest["headers"]): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(input)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((vv) => h.append(k, vv));
    else h.set(k, String(v));
  }
  return h;
}
