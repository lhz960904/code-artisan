import "reflect-metadata";
import multipart from "@fastify/multipart";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.schema.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  const cfg = app.get(ConfigService) as ConfigService<Env, true>;
  const port = cfg.get("PORT", { infer: true });
  await app.listen({ port, host: "0.0.0.0" });
  app.get(PinoLogger).log(`backend-nest listening on :${port}`, "bootstrap");
}

void bootstrap();
