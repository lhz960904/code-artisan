import { Module } from "@nestjs/common";
import { CryptoService } from "./crypto.service.js";
import { IntegrationController } from "./integration.controller.js";
import { OAuthTokenRepository } from "./oauth-token.repository.js";
import { SupabaseManagementService } from "./supabase/supabase-management.service.js";
import { SupabaseOAuthService } from "./supabase/supabase-oauth.service.js";
import { VercelOAuthService } from "./vercel/vercel-oauth.service.js";

@Module({
  controllers: [IntegrationController],
  providers: [
    CryptoService,
    OAuthTokenRepository,
    VercelOAuthService,
    SupabaseOAuthService,
    SupabaseManagementService,
  ],
  // Exported services for cross-module consumption:
  //   *OAuthService — OAuth token CRUD (deployment will read Vercel token)
  //   SupabaseManagementService — Supabase REST/SQL (database route now,
  //                               deployment for project/keys creation later)
  exports: [VercelOAuthService, SupabaseOAuthService, SupabaseManagementService],
})
export class IntegrationModule {}
