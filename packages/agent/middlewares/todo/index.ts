import * as z from "zod";
import { defineTool, type Tool } from "../../tools/tool";
import type { AgentMiddleware } from "../../types/middleware";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

const TODO_WRITE_TOOL_NAME = "todo_write";

const TOOL_DESCRIPTION = `Create and manage a structured task list for the current session. This helps track progress, organize complex tasks, and demonstrate thoroughness.

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

## Merge Behavior

- merge=true: Merges by id — existing ids are updated, new ids are appended. You can send only the changed items.
- merge=false: Replaces the entire list with the provided todos.`;

const REMINDER_CONFIG = {
  STEPS_SINCE_WRITE: 10,
  STEPS_BETWEEN_REMINDERS: 10,
} as const;

function formatSummary(todoList: TodoItem[]): string {
  const marker = {
    pending: "[ ]",
    in_progress: "[>]",
    completed: "[x]",
  };
  const completed = todoList.reduce((acc, t) => acc + Number(t.status === "completed"), 0);
  const lines = todoList.map((t, i) => `${i + 1}. ${marker[t.status]} ${t.content}`).join("\n");
  return `Todo list updated, ${completed}/${todoList.length} completed. \n${lines}`;
}

function formatReminder(todos: TodoItem[]): string {
  const lines = todos.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`).join("\n");
  return `\n<todo_reminder>
The todo_write tool hasn't been used recently. If you're working on tasks that benefit from tracking, consider updating your todo list. Only use it if relevant to the current work. Here are the current items:

${lines}
</todo_reminder>`;
}

/**
 * Creates a middleware and tool for managing a todo list.
 */
export function createTodoSystem(): { middleware: AgentMiddleware; tool: Tool } {
  let todoList: TodoItem[] = [];
  let stepsSinceLastWrite = Infinity;
  let stepsSinceLastReminder = Infinity;

  const tool = defineTool({
    name: TODO_WRITE_TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: z.object({
      todos: z
        .array(
          z.object({
            id: z.string().describe("Unique identifier for this todo item."),
            content: z.string().describe("Description of the task."),
            status: z.enum(["pending", "in_progress", "completed"]).describe("Current status."),
          }),
        )
        .describe("Array of todo items to create or update."),
      merge: z
        .boolean()
        .describe("If true, merges into the existing list by id (existing ids updated, new ids appended). If false, replaces the entire list."),
    }),
    invoke: async ({ todos, merge }) => {
      if (merge) {
        for (const item of todos) {
          const idx = todoList.findIndex((t) => t.id === item.id);
          if (idx >= 0) {
            todoList[idx] = item;
          } else {
            todoList.push(item);
          }
        }
      } else {
        todoList = [...todos];
      }
      stepsSinceLastWrite = 0;
      return formatSummary(todoList);
    },
  });

  const middleware: AgentMiddleware = {
    beforeModel: async ({ modelContext }) => {
      stepsSinceLastWrite++;
      stepsSinceLastReminder++;

      if (
        todoList.length > 0 &&
        stepsSinceLastWrite >= REMINDER_CONFIG.STEPS_SINCE_WRITE &&
        stepsSinceLastReminder >= REMINDER_CONFIG.STEPS_BETWEEN_REMINDERS
      ) {
        stepsSinceLastReminder = 0;
        return { prompt: modelContext.prompt + formatReminder(todoList) };
      }
    },

    afterToolUse: async ({ toolUse }) => {
      if (toolUse.name === TODO_WRITE_TOOL_NAME) {
        stepsSinceLastWrite = 0;
      }
    },
  };

  return { middleware, tool };
}
