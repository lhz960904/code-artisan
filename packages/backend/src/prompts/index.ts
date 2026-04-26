import { composeSystemPrompt } from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import { WEB_IDENTITY, buildEnvironmentSection, buildUserInstructionsSection } from "./sections";

export function buildWebSystemPrompt(userSystemPrompt?: string): string {
  const trimmed = userSystemPrompt?.trim();
  return composeSystemPrompt({
    identity: WEB_IDENTITY,
    environment: buildEnvironmentSection(SANDBOX_WORKSPACE_ROOT),
    appendSections: trimmed ? [buildUserInstructionsSection(trimmed)] : undefined,
  });
}

export { WEB_IDENTITY, buildEnvironmentSection, buildUserInstructionsSection } from "./sections";
