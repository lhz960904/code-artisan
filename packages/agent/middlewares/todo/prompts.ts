export const TOOL_DESCRIPTION = `Create and manage a structured task list for the current session. This helps track progress, organize complex tasks, and demonstrate thoroughness.

## When to Use

1. Complex multi-step tasks requiring 3 or more distinct steps
2. Non-trivial tasks requiring careful planning or multiple operations
3. User explicitly requests a todo list
4. User provides multiple tasks (numbered or comma-separated)
5. After receiving new instructions — capture requirements as todos (use merge=false to add new ones)
6. After completing tasks — mark complete with merge=true and add follow-ups
7. When starting new tasks — mark as in_progress (ideally only one at a time)

## When NOT to Use

1. Single, straightforward tasks
2. Trivial tasks with no organizational benefit
3. Tasks completable in fewer than 3 trivial steps
4. Purely conversational or informational requests

## Task States

- pending: Not yet started
- in_progress: Currently working on (limit to ONE at a time)
- completed: Finished successfully
- cancelled: No longer needed

## Task Management Rules

- Update status in real-time as you work
- Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
- Only ONE task should be in_progress at any time
- Complete current tasks before starting new ones
- If blocked, keep the task as in_progress and create a new task for the blocker

## Plan name

Every call must include a short \`name\` identifying the *plan* these todos
belong to (e.g. "Onboarding flow", "Fix auth regression").

- Reuse the SAME \`name\` whenever updating statuses of todos you already
  declared — they are grouped and rendered as a single plan.
- Use a NEW \`name\` only when starting a fresh, unrelated plan.

## Merge Behavior

- merge=true: Merges by id — existing ids are updated, new ids are appended. You can send only the changed items.
- merge=false: Replaces the entire list with the provided todos.`;

export const CONCURRENT_WRITE_ERROR =
  "Error: todo_write was already called in this turn. Multiple concurrent todo_write calls create ambiguous state — only the first call took effect. Merge all updates into a single call next turn.";

export const POST_WRITE_REMINDER =
  "Continue using todo_write as you progress. Keep exactly one task in_progress and mark it completed the moment you finish it.";

export function formatReactiveReminder(lines: string): string {
  return `\n<todo_reminder>
The todo_write tool hasn't been used recently. If you're working on tasks that benefit from tracking, consider updating your todo list. Only use it if relevant to the current work. Here are the current items:

${lines}
</todo_reminder>`;
}
