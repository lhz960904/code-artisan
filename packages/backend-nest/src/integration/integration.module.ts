import { Module } from "@nestjs/common";
import { CryptoService } from "./crypto.service.js";
import { IntegrationController } from "./integration.controller.js";
import { OAuthTokenRepository } from "./oauth-token.repository.js";
import { SupabaseOAuthService } from "./supabase/supabase-oauth.service.js";
import { VercelOAuthService } from "./vercel/vercel-oauth.service.js";

@Module({
  controllers: [IntegrationController],
  providers: [
    CryptoService,
    OAuthTokenRepository,
    VercelOAuthService,
    SupabaseOAuthService,
  ],
  // Token services are exported so deployment/database modules can read OAuth
  // tokens when they migrate (Vercel project mgmt, Supabase SQL/management).
  exports: [VercelOAuthService, SupabaseOAuthService],
})
export class IntegrationModule {}
