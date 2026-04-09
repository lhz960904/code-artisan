import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import type { NonSystemMessage } from "@code-artisan/agent";

import { currentTheme } from "../themes/index";

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

/**
 * Extract the latest todo list from message history by scanning for
 * the most recent `todo_write` tool call.
 */
export function extractTodos(messages: NonSystemMessage[]): TodoItem[] {
  let todos: TodoItem[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const content of msg.content) {
      if (content.type === "tool_use" && content.name === "todo_write") {
        const input = content.input as { todos: TodoItem[]; merge: boolean };
        if (input.merge) {
          for (const item of input.todos) {
            const idx = todos.findIndex((t) => t.id === item.id);
            if (idx >= 0) {
              todos[idx] = item;
            } else {
              todos.push(item);
            }
          }
        } else {
          todos = [...input.todos];
        }
      }
    }
  }

  return todos;
}

export function TodoList({ messages, isBusy }: { messages: NonSystemMessage[]; isBusy: boolean }) {
  const todos = extractTodos(messages);
  if (todos.length === 0) return null;

  const inProgress = todos.find((t) => t.status === "in_progress");
  const allCompleted = todos.every((t) => t.status === "completed");
  const completedCount = todos.filter((t) => t.status === "completed").length;

  if (allCompleted) {
    return (
      <Box gap={1}>
        <Text color="green">✓</Text>
        <Text color={currentTheme.colors.secondaryText}>All {todos.length} tasks completed</Text>
      </Box>
    );
  }

  const inProgressCount = todos.filter((t) => t.status === "in_progress").length;
  const openCount = todos.length - completedCount - inProgressCount;
  const title = `${todos.length} tasks (${completedCount} done, ${inProgressCount} in progress, ${openCount} open)`;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        {isBusy ? (
          <Text color="#e0a080">
            <Spinner type="star" />
          </Text>
        ) : (
          <Text color="#e0a080">✱</Text>
        )}
        <Text color={currentTheme.colors.secondaryText}>{title}</Text>
      </Box>
      <Box flexDirection="column" marginLeft={3}>
        {todos.map((todo) => (
          <Box key={todo.id} gap={1}>
            <TodoItemView todo={todo} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function TodoItemView({ todo }: { todo: TodoItem }) {
  switch (todo.status) {
    case "completed":
      return (
        <Text color={currentTheme.colors.secondaryText} strikethrough>
          <Text color="green">✓</Text> {todo.content}
        </Text>
      );
    case "in_progress":
      return <Text color="white">■ {todo.content}</Text>;
    case "pending":
      return <Text color={currentTheme.colors.secondaryText}>□ {todo.content}</Text>;
  }
}
