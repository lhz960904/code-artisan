import { Global, Module } from "@nestjs/common";
import { SandboxPoolService } from "./sandbox-pool.service.js";

// Global because the sandbox pool is the single owner of per-conversation E2B
// instances — agent runtime, deploy, version restore, and dev-server bootstrap
// all need the same pool.
@Global()
@Module({
  providers: [SandboxPoolService],
  exports: [SandboxPoolService],
})
export class SandboxModule {}
