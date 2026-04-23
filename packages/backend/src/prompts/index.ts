import { composeSystemPrompt } from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import { WEB_IDENTITY, buildEnvironmentSection } from "./sections";

export function buildWebSystemPrompt(): string {
  return composeSystemPrompt({
    identity: WEB_IDENTITY,
    environment: buildEnvironmentSection(SANDBOX_WORKSPACE_ROOT),
  });
}

export { WEB_IDENTITY, buildEnvironmentSection } from "./sections";
