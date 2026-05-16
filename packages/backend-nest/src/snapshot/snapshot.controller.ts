import { Controller, Get, Param } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { ListSnapshotParamDto } from "./dto/list-snapshot.dto.js";
import { SnapshotService } from "./snapshot.service.js";

@Controller("snapshot")
export class SnapshotController {
  constructor(private readonly snapshotService: SnapshotService) {}

  @Get(":conversationId")
  list(@CurrentUser() user: AuthUser, @Param() param: ListSnapshotParamDto) {
    return this.snapshotService.listForOwnedConversation(user.id, param.conversationId);
  }
}
