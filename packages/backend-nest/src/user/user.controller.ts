import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { UserService } from "./user.service.js";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id, name: user.name, email: user.email, image: user.image };
  }

  @Get("quota")
  quota(@CurrentUser() user: AuthUser) {
    return this.userService.getQuota(user.id);
  }
}
