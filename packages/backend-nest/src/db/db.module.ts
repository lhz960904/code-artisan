import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.schema.js";
import * as schema from "./schema.js";
import { DRIZZLE, type DrizzleDB } from "./db.token.js";

const POSTGRES_CLIENT = Symbol("POSTGRES_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): Sql => postgres(env.DATABASE_URL),
    },
    {
      provide: DRIZZLE,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: Sql): DrizzleDB => drizzle(client, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(POSTGRES_CLIENT) private readonly client: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
