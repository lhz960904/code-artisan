import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";
import type { Env } from "../../config/env.schema.js";

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<Env, true>) => {
        const nodeEnv = cfg.get("NODE_ENV", { infer: true });
        return {
          pinoHttp: {
            level: nodeEnv === "production" ? "info" : "debug",
            transport:
              nodeEnv === "development"
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
        };
      },
    }),
  ],
})
export class LoggerModule {}
