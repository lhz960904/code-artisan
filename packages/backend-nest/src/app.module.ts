import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./db/db.module.js";
import { ModelsModule } from "./models/models.module.js";
import { LoggerModule } from "./observability/logger/logger.module.js";
import { SettingModule } from "./setting/setting.module.js";
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
  ],
})
export class AppModule {}
