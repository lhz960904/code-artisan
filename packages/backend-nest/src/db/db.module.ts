import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import type { Env } from "../config/env.schema.js";
import * as schema from "./schema.js";
import { DRIZZLE, type DrizzleDB } from "./db.token.js";

const POSTGRES_CLIENT = Symbol("POSTGRES_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<Env, true>): Sql =>
        postgres(cfg.get("DATABASE_URL", { infer: true })),
    },
    {
      provide: DRIZZLE,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: Sql): DrizzleDB => drizzle(client, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POSTGRES_CLIENT) private readonly client: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
