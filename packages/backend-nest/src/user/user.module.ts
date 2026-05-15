import { Module } from "@nestjs/common";
import { UserController } from "./user.controller.js";
import { UserRepository } from "./user.repository.js";
import { UserService } from "./user.service.js";

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
})
export class UserModule {}
