import { Global, Module } from "@nestjs/common";
import { AgentRunnerRegistryService } from "./agent-runner-registry.service.js";

// Global so message route + agent-turn factory share the same registry without
// import wiring.
@Global()
@Module({
  providers: [AgentRunnerRegistryService],
  exports: [AgentRunnerRegistryService],
})
export class AgentRunnerModule {}
