import { Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { ListVersionsParamDto } from "./dto/list-versions.dto.js";
import { VersionIdParamDto } from "./dto/version-id.dto.js";
import { VersionService } from "./version.service.js";

// Hono mounts versionRouter under /api/conversation, so version URLs nest
// inside the conversation namespace. Keep the same shape here.
@Controller("conversation/:conversationId/versions")
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param() param: ListVersionsParamDto) {
    return this.versionService.listForOwnedConversation(user.id, param.conversationId);
  }

  @Get(":versionId/files")
  listFiles(@CurrentUser() user: AuthUser, @Param() param: VersionIdParamDto) {
    return this.versionService.listFiles(user.id, param.conversationId, param.versionId);
  }

  @Post(":versionId/preview")
  preview(@CurrentUser() user: AuthUser, @Param() param: VersionIdParamDto) {
    return this.versionService.preview(user.id, param.conversationId, param.versionId);
  }

  @Post(":versionId/restore")
  restore(@CurrentUser() user: AuthUser, @Param() param: VersionIdParamDto) {
    return this.versionService.restore(user.id, param.conversationId, param.versionId);
  }
}
