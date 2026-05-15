import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { envSchema } from "./env.schema.js";

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // Bun loads .env via --env-file; skip dotenv to avoid double parsing.
      ignoreEnvFile: true,
      validate: (config) => envSchema.parse(config),
    }),
  ],
})
export class ConfigModule {}
