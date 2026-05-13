import { Module } from "@nestjs/common";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";
import { ENV } from "../../config/config.module.js";
import type { Env } from "../../config/env.schema.js";

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === "production" ? "info" : "debug",
          transport:
            env.NODE_ENV === "development"
              ? {
                  target: "pino-pretty",
                  options: { singleLine: true, translateTime: "SYS:HH:MM:ss" },
                }
              : undefined,
          redact: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.token", "*.secret"],
          autoLogging: { ignore: (req) => req.url === "/api/health" },
          // Placeholder for OTel traceId injection — populated when tracing module lands.
          customProps: () => ({}),
        },
      }),
    }),
  ],
})
export class LoggerModule {}
