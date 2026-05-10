import { composeSystemPrompt } from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import {
  WEB_IDENTITY,
  PROJECT_CONVENTIONS,
  buildEnvironmentSection,
  buildSupabaseConnectionReminder,
  buildUserInstructionsSection,
} from "./sections";

export interface BuildWebSystemPromptParams {
  supabaseConnected: boolean;
  userSystemPrompt?: string;
}

export function buildWebSystemPrompt(params: BuildWebSystemPromptParams): string {
  const trimmed = params.userSystemPrompt?.trim();
  const appendSections: string[] = [PROJECT_CONVENTIONS];
  const supabaseReminder = buildSupabaseConnectionReminder(params.supabaseConnected);
  if (supabaseReminder) appendSections.push(supabaseReminder);
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
  buildSupabaseConnectionReminder,
  buildUserInstructionsSection,
} from "./sections";
