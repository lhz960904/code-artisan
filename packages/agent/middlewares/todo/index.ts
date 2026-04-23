import * as z from "zod";
import { defineTool, type Tool } from "../../tools/tool";
import type { AgentMiddleware } from "../../types/middleware";
import {
  TOOL_DESCRIPTION,
  CONCURRENT_WRITE_ERROR,
  POST_WRITE_REMINDER,
  formatReactiveReminder,
} from "./prompts";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

const TODO_WRITE_TOOL_NAME = "todo_write";

const REMINDER_CONFIG = {
  STEPS_SINCE_WRITE: 5,
  STEPS_BETWEEN_REMINDERS: 5,
} as const;

function formatSummary(name: string, todoList: TodoItem[]): string {
  const marker = {
    pending: "[ ]",
    in_progress: "[>]",
    completed: "[x]",
  };
  const completed = todoList.reduce((acc, t) => acc + Number(t.status === "completed"), 0);
  const lines = todoList.map((t, i) => `${i + 1}. ${marker[t.status]} ${t.content}`).join("\n");
  return `Plan "${name}" updated, ${completed}/${todoList.length} completed.\n${lines}`;
}

/**
 * Creates a middleware and tool for managing a todo list.
 */
export function createTodoSystem(): { middleware: AgentMiddleware; tool: Tool } {
  let todoList: TodoItem[] = [];
  let stepsSinceLastWrite = Infinity;
  let stepsSinceLastReminder = Infinity;
  let invocationsThisStep = 0;

  const tool = defineTool({
    name: TODO_WRITE_TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: z.object({
      name: z
        .string()
        .describe(
          "Short label identifying the plan these todos belong to. Reuse the same name when updating; use a new name only for a fresh plan.",
        ),
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
    invoke: async ({ name, todos, merge }, _ctx) => {
      invocationsThisStep++;
      if (invocationsThisStep > 1) {
        return CONCURRENT_WRITE_ERROR;
      }
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
      return `${formatSummary(name, todoList)}\n\n${POST_WRITE_REMINDER}`;
    },
  });

  const middleware: AgentMiddleware = {
    beforeAgentStep: async () => {
      invocationsThisStep = 0;
    },

    beforeModel: async ({ modelContext }) => {
      stepsSinceLastWrite++;
      stepsSinceLastReminder++;

      if (
        todoList.length > 0 &&
        stepsSinceLastWrite >= REMINDER_CONFIG.STEPS_SINCE_WRITE &&
        stepsSinceLastReminder >= REMINDER_CONFIG.STEPS_BETWEEN_REMINDERS
      ) {
        stepsSinceLastReminder = 0;
        const lines = todoList.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`).join("\n");
        return { prompt: modelContext.prompt + formatReactiveReminder(lines) };
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
