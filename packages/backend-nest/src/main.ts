import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { ResponseTransformInterceptor } from "./common/interceptors/response-transform.interceptor.js";
import { ENV } from "./config/config.module.js";
import type { Env } from "./config/env.schema.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.setGlobalPrefix("api");
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const env = app.get<symbol, Env>(ENV);
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.get(PinoLogger).log(`backend-nest listening on :${env.PORT}`, "bootstrap");
}

void bootstrap();
