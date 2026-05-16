import { Controller, Get, Param, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.provider.js";
import { DatabaseService } from "./database.service.js";
import { ListRowsParamDto, ListRowsQueryDto } from "./dto/list-rows.dto.js";
import { ListTablesParamDto } from "./dto/list-tables.dto.js";

// Same mount as Hono — under /api/conversation/:conversationId/database/...
@Controller("conversation/:conversationId/database")
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get("tables")
  listTables(@CurrentUser() user: AuthUser, @Param() param: ListTablesParamDto) {
    return this.databaseService.listTables(user.id, param.conversationId);
  }

  @Get("tables/:name")
  listRows(
    @CurrentUser() user: AuthUser,
    @Param() param: ListRowsParamDto,
    @Query() query: ListRowsQueryDto,
  ) {
    return this.databaseService.listRows(
      user.id,
      param.conversationId,
      param.name,
      query.limit,
      query.offset,
    );
  }
}
