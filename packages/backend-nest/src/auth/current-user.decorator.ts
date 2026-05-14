import { type ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "./auth.provider.js";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!req.user) throw new Error("@CurrentUser used without AuthGuard");
  return req.user;
});
