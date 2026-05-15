import { Injectable } from "@nestjs/common";
import { UserRepository } from "./user.repository.js";

const DEFAULT_TOTAL_TOKENS = 1_000_000;

@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  async getQuota(userId: string) {
    const quota = await this.userRepo.findQuotaByUserId(userId);
    if (!quota) {
      return {
        totalTokens: DEFAULT_TOTAL_TOKENS,
        usedTokens: 0,
        remaining: DEFAULT_TOTAL_TOKENS,
      };
    }
    return {
      totalTokens: quota.totalTokens,
      usedTokens: quota.usedTokens,
      remaining: quota.totalTokens - quota.usedTokens,
    };
  }
}
