import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.token.js";
import { userQuotas } from "../db/schema.js";

@Injectable()
export class UserRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findQuotaByUserId(userId: string) {
    const [row] = await this.db.select().from(userQuotas).where(eq(userQuotas.userId, userId));
    return row ?? null;
  }
}
