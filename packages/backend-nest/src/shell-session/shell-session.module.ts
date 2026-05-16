import { Global, Module } from "@nestjs/common";
import { ShellSessionManagerService } from "./shell-session-manager.service.js";

// Global because the session manager is the single owner of PTY-backed shells.
// Agent runtime, terminal WS gateway, dev-server bootstrap, and the preview
// panel state lookup all hit the same instance.
@Global()
@Module({
  providers: [ShellSessionManagerService],
  exports: [ShellSessionManagerService],
})
export class ShellSessionModule {}
