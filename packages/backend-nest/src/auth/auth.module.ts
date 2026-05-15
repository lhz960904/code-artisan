import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema.js";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { AUTH, type Auth, createAuth } from "./auth.provider.js";
import { AuthGuard } from "./auth.guard.js";

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [ConfigService, DRIZZLE],
      useFactory: (cfg: ConfigService<Env, true>, db: DrizzleDB): Auth =>
        createAuth(
          {
            secret: cfg.get("BETTER_AUTH_SECRET", { infer: true }),
            baseURL: cfg.get("BETTER_AUTH_URL", { infer: true }),
            github: {
              clientId: cfg.get("GITHUB_CLIENT_ID", { infer: true }),
              clientSecret: cfg.get("GITHUB_CLIENT_SECRET", { infer: true }),
            },
          },
          db,
        ),
    },
    AuthGuard,
  ],
  exports: [AUTH, AuthGuard],
})
export class AuthModule {}
