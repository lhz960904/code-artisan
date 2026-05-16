import { Module } from "@nestjs/common";
import { CryptoService } from "./crypto.service.js";
import { IntegrationController } from "./integration.controller.js";
import { OAuthTokenRepository } from "./oauth-token.repository.js";
import { SupabaseManagementService } from "./supabase/supabase-management.service.js";
import { SupabaseOAuthService } from "./supabase/supabase-oauth.service.js";
import { VercelOAuthService } from "./vercel/vercel-oauth.service.js";
import { VercelProjectService } from "./vercel/vercel-project.service.js";

@Module({
  controllers: [IntegrationController],
  providers: [
    CryptoService,
    OAuthTokenRepository,
    VercelOAuthService,
    VercelProjectService,
    SupabaseOAuthService,
    SupabaseManagementService,
  ],
  // Exported services for cross-module consumption:
  //   *OAuthService            — OAuth token CRUD (connect flow + status)
  //   VercelProjectService     — Vercel REST (deployment when sandbox migrates)
  //   SupabaseManagementService — Supabase REST/SQL (database route)
  exports: [
    VercelOAuthService,
    VercelProjectService,
    SupabaseOAuthService,
    SupabaseManagementService,
  ],
})
export class IntegrationModule {}
