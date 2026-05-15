import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { ConversationService } from "./conversation.service.js";
import { ConversationIdParamDto } from "./dto/conversation-id.dto.js";
import { CreateConversationDto } from "./dto/create-conversation.dto.js";
import { UpdateConversationDto } from "./dto/update-conversation.dto.js";

@Controller("conversation")
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateConversationDto) {
    return this.conversationService.create(user.id, body.title);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conversationService.list(user.id);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param() param: ConversationIdParamDto) {
    return this.conversationService.getDetail(user.id, param.id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param() param: ConversationIdParamDto,
    @Body() body: UpdateConversationDto,
  ) {
    return this.conversationService.update(user.id, param.id, body);
  }

  @Post(":id/share")
  share(@CurrentUser() user: AuthUser, @Param() param: ConversationIdParamDto) {
    return this.conversationService.share(user.id, param.id);
  }

  @Delete(":id/share")
  unshare(@CurrentUser() user: AuthUser, @Param() param: ConversationIdParamDto) {
    return this.conversationService.unshare(user.id, param.id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param() param: ConversationIdParamDto) {
    return this.conversationService.remove(user.id, param.id);
  }
}
