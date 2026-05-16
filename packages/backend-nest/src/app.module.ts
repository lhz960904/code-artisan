import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { ResponseTransformInterceptor } from "./common/interceptors/response-transform.interceptor.js";
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe.js";
import { ConfigModule } from "./config/config.module.js";
import { ConversationModule } from "./conversation/conversation.module.js";
import { DatabaseModule } from "./db/db.module.js";
import { MessageModule } from "./message/message.module.js";
import { ModelsModule } from "./models/models.module.js";
import { LoggerModule } from "./observability/logger/logger.module.js";
import { PublicModule } from "./public/public.module.js";
import { SettingModule } from "./setting/setting.module.js";
import { SnapshotModule } from "./snapshot/snapshot.module.js";
import { UserModule } from "./user/user.module.js";

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    AuthModule,
    UserModule,
    ModelsModule,
    SettingModule,
    ConversationModule,
    MessageModule,
    SnapshotModule,
    PublicModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
