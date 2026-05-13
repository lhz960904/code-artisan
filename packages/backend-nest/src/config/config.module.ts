import { Global, Module } from "@nestjs/common";
import { envSchema, type Env } from "./env.schema.js";

export const ENV = Symbol("ENV");

const env: Env = envSchema.parse(process.env);

@Global()
@Module({
  providers: [{ provide: ENV, useValue: env }],
  exports: [ENV],
})
export class ConfigModule {}
