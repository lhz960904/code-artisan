import {
  DEFAULT_IDENTITY,
  SYSTEM_SECTION,
  DOING_TASKS_SECTION,
  EXECUTING_ACTIONS_SECTION,
  USING_TOOLS_SECTION,
  TONE_STYLE_SECTION,
  COMMUNICATING_SECTION,
} from "./sections";

export interface SystemPromptOptions {
  identity?: string;
  environment?: string;
  appendSections?: string[];
}

export function composeSystemPrompt(options: SystemPromptOptions = {}): string {
  const parts: (string | undefined)[] = [
    options.identity ?? DEFAULT_IDENTITY,
    SYSTEM_SECTION,
    DOING_TASKS_SECTION,
    EXECUTING_ACTIONS_SECTION,
    USING_TOOLS_SECTION,
    TONE_STYLE_SECTION,
    COMMUNICATING_SECTION,
    options.environment,
    ...(options.appendSections ?? []),
  ];
  return parts.filter((part): part is string => Boolean(part)).join("\n\n");
}
