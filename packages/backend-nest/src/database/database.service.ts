import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { DomainException } from "../common/exceptions/domain.exception.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { SupabaseManagementService } from "../integration/supabase/supabase-management.service.js";

const LIST_TABLES_SQL = `
  SELECT table_name AS name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`;

@Injectable()
export class DatabaseService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly supabaseManagement: SupabaseManagementService,
  ) {}

  async listTables(userId: string, conversationId: string) {
    const ref = await this.requireProjectRef(userId, conversationId);
    const rows = await this.supabaseManagement.runSql(userId, ref, LIST_TABLES_SQL);
    return { tables: rows.map((r) => r.name as string) };
  }

  async listRows(
    userId: string,
    conversationId: string,
    tableName: string,
    limit: number,
    offset: number,
  ) {
    const ref = await this.requireProjectRef(userId, conversationId);
    // tableName is regex-gated by the param DTO (IDENT_RE), limit/offset are
    // coerced numbers — safe to interpolate after Postgres quotes the ident.
    const query = `SELECT * FROM "public"."${tableName}" LIMIT ${limit} OFFSET ${offset}`;
    const rows = await this.supabaseManagement.runSql(userId, ref, query);
    return { rows };
  }

  private async requireProjectRef(userId: string, conversationId: string): Promise<string> {
    const conversation = await this.conversationService.requireOwned(userId, conversationId);
    if (!conversation.supabaseProjectRef) {
      throw new NotFoundException("No Supabase project on this conversation");
    }
    return conversation.supabaseProjectRef;
  }
}
