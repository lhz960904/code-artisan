import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { SettingService } from "./setting.service.js";

class ListSettingsQueryDto extends createZodDto(z.object({ search: z.string().optional() })) {}
class InstallBodyDto extends createZodDto(
  z.object({
    serverId: z.string().min(1),
    envVars: z.record(z.string(), z.string()),
  }),
) {}
class ServerIdParamDto extends createZodDto(z.object({ serverId: z.string().min(1) })) {}
class PatchBodyDto extends createZodDto(z.object({ envVars: z.record(z.string(), z.string()) })) {}

@Controller("setting")
@UseGuards(AuthGuard)
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListSettingsQueryDto) {
    return this.settingService.listServers(user.id, query.search);
  }

  @Post("install")
  @HttpCode(HttpStatus.CREATED)
  async install(@CurrentUser() user: AuthUser, @Body() body: InstallBodyDto) {
    await this.settingService.install(user.id, body.serverId, body.envVars);
    return { serverId: body.serverId };
  }

  @Delete(":serverId")
  async uninstall(@CurrentUser() user: AuthUser, @Param() param: ServerIdParamDto) {
    await this.settingService.uninstall(user.id, param.serverId);
    return { serverId: param.serverId };
  }

  @Patch(":serverId")
  async updateEnvVars(
    @CurrentUser() user: AuthUser,
    @Param() param: ServerIdParamDto,
    @Body() body: PatchBodyDto,
  ) {
    await this.settingService.updateEnvVars(user.id, param.serverId, body.envVars);
    return { serverId: param.serverId };
  }
}
