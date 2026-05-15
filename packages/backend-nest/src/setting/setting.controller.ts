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
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { InstallMcpDto } from "./dto/install-mcp.dto.js";
import { ListMcpQueryDto } from "./dto/list-mcp.dto.js";
import { PatchMcpDto } from "./dto/patch-mcp.dto.js";
import { ServerIdParamDto } from "./dto/server-id.dto.js";
import { SettingService } from "./setting.service.js";

@Controller("setting")
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListMcpQueryDto) {
    return this.settingService.listServers(user.id, query.search);
  }

  @Post("install")
  @HttpCode(HttpStatus.CREATED)
  async install(@CurrentUser() user: AuthUser, @Body() body: InstallMcpDto) {
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
    @Body() body: PatchMcpDto,
  ) {
    await this.settingService.updateEnvVars(user.id, param.serverId, body.envVars);
    return { serverId: param.serverId };
  }
}
