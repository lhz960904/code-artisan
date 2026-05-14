import { Global, Module } from "@nestjs/common";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.schema.js";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { AUTH, type Auth, createAuth } from "./auth.provider.js";
import { AuthGuard } from "./auth.guard.js";

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [ENV, DRIZZLE],
      useFactory: (env: Env, db: DrizzleDB): Auth => createAuth(env, db),
    },
    AuthGuard,
  ],
  exports: [AUTH, AuthGuard],
})
export class AuthModule {}
