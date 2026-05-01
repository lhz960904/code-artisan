import { composeSystemPrompt } from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import {
  WEB_IDENTITY,
  PROJECT_CONVENTIONS,
  buildEnvironmentSection,
  buildUserInstructionsSection,
} from "./sections";

export function buildWebSystemPrompt(userSystemPrompt?: string): string {
  const trimmed = userSystemPrompt?.trim();
  const appendSections = [PROJECT_CONVENTIONS];
  if (trimmed) appendSections.push(buildUserInstructionsSection(trimmed));
  return composeSystemPrompt({
    identity: WEB_IDENTITY,
    environment: buildEnvironmentSection(SANDBOX_WORKSPACE_ROOT),
    appendSections,
  });
}

export {
  WEB_IDENTITY,
  PROJECT_CONVENTIONS,
  buildEnvironmentSection,
  buildUserInstructionsSection,
} from "./sections";
