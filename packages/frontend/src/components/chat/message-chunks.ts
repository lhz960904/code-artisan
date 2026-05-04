import type {
  StoredMessage,
  StoredUserMessage,
  ToolResultContent,
  ToolUseContent,
} from "@code-artisan/shared";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TaskStep {
  toolUse: ToolUseContent;
  toolResult?: ToolResultContent;
}

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  steps: TaskStep[];
}

/** Stable React key used by MessageList when rendering this chunk. */
interface Keyed {
  key: string;
}

export interface TodoListChunk extends Keyed {
  kind: "todo-list";
  /** Plan name declared by the agent in `todo_write.input.name`. */
  name: string;
  todos: TodoItem[];
}

export interface UserChunk extends Keyed {
  kind: "user";
  message: StoredUserMessage;
}

export interface AssistantTextChunk extends Keyed {
  kind: "assistant-text";
  text: string;
}

export interface ThinkingChunk extends Keyed {
  kind: "thinking";
  thinking: string;
  isStreaming: boolean;
}

export interface LooseToolChunk extends Keyed {
  kind: "tool";
  toolUse: ToolUseContent;
  toolResult?: ToolResultContent;
}

export interface ToolGroupChunk extends Keyed {
  kind: "tool-group";
  tools: Array<{ toolUse: ToolUseContent; toolResult?: ToolResultContent }>;
}

export interface CompactedChunk extends Keyed {
  kind: "compacted";
  message: StoredMessage;
}

export interface VersionChunk extends Keyed {
  kind: "version";
  versionId: string;
  versionLabel: string;
  createdAt: string;
  fileCount: number;
  isCurrent: boolean;
  isPreviewing: boolean;
}

export interface RestoreChunk extends Keyed {
  kind: "restore";
  restoredToVersionId: string;
  restoredToLabel: string;
  fromVersionLabel: string | null;
  revertedFileCount: number;
  createdAt: string;
}

export type RenderChunk =
  | UserChunk
  | AssistantTextChunk
  | ThinkingChunk
  | TodoListChunk
  | LooseToolChunk
  | ToolGroupChunk
  | CompactedChunk
  | VersionChunk
  | RestoreChunk;

export interface VersionChipInfo {
  versionId: string;
  versionLabel: string;
  createdAt: string;
  fileCount: number;
  isCurrent: boolean;
  isPreviewing: boolean;
}

interface BuildChunksOptions {
  /** id of the assistant message currently streaming (or null). */
  streamingMessageId: string | null;
  /** Map of user-message-id → version produced by that turn. */
  versionByUserMessageId?: Map<string, VersionChipInfo>;
  /** versionId → display label, for resolving labels inside restore checkpoints. */
  versionLabelById?: Map<string, string>;
}

/**
 * Transforms a raw message list into a flat chunk list for rendering.
 *
 * `todo_write` tool uses are grouped by their `input.name` into a single
 * {@link TodoListChunk} per plan — multiple status-update calls with the same
 * name fold into the same card. Non-`todo_write` tool uses that follow land
 * as {@link TaskStep}s under the todo item that's currently `in_progress`.
 */
export function buildChunks(messages: StoredMessage[], options: BuildChunksOptions): RenderChunk[] {
  const sliced = sliceFromLastCompaction(messages);
  const toolResultLookup = buildToolResultLookup(sliced);

  const chunks: RenderChunk[] = [];
  const todoListsByName = new Map<string, TodoListChunk>();
  let currentListName: string | null = null;
  let currentInProgressTodoId: string | null = null;
  let pendingTurnUserMessageId: string | null = null;

  // Emit a version chip for the in-flight turn, if its user message produced one.
  const flushVersionChip = () => {
    if (!pendingTurnUserMessageId) return;
    const info = options.versionByUserMessageId?.get(pendingTurnUserMessageId);
    pendingTurnUserMessageId = null;
    if (!info) return;
    chunks.push({
      kind: "version",
      key: `version:${info.versionId}`,
      versionId: info.versionId,
      versionLabel: info.versionLabel,
      createdAt: info.createdAt,
      fileCount: info.fileCount,
      isCurrent: info.isCurrent,
      isPreviewing: info.isPreviewing,
    });
  };

  for (const message of sliced) {
    if (message.metadata?.compacted) {
      flushVersionChip();
      chunks.push({ kind: "compacted", key: `compacted:${message.id}`, message });
      continue;
    }

    if (message.metadata?.type === "restore_checkpoint") {
      flushVersionChip();
      const meta = message.metadata as {
        restoredToVersionId?: string;
        fromVersionId?: string;
        revertedFileCount?: number;
      };
      if (meta.restoredToVersionId) {
        chunks.push({
          kind: "restore",
          key: `restore:${message.id}`,
          restoredToVersionId: meta.restoredToVersionId,
          restoredToLabel: options.versionLabelById?.get(meta.restoredToVersionId) ?? "earlier version",
          fromVersionLabel: meta.fromVersionId
            ? (options.versionLabelById?.get(meta.fromVersionId) ?? null)
            : null,
          revertedFileCount: meta.revertedFileCount ?? 0,
          createdAt: message.createdAt ?? new Date().toISOString(),
        });
      }
      // After restore, any pending turn version chip belongs to a discarded
      // branch — drop the pending id so it doesn't get attached to the next chunk.
      pendingTurnUserMessageId = null;
      continue;
    }

    if (message.role === "user") {
      flushVersionChip();
      chunks.push({ kind: "user", key: `user:${message.id}`, message: message as StoredUserMessage });
      pendingTurnUserMessageId = message.id;
      continue;
    }

    if (message.role !== "assistant") continue;

    const isStreamingMessage = message.id === options.streamingMessageId;
    const hasToolUse = message.content.some((block) => block.type === "tool_use");
    const suppressThinking = hasToolUse && !isStreamingMessage;

    for (let blockIndex = 0; blockIndex < message.content.length; blockIndex++) {
      const block = message.content[blockIndex];
      const key = `${message.id}:${blockIndex}`;

      if (block.type === "text") {
        chunks.push({ kind: "assistant-text", key, text: block.text });
        continue;
      }
      if (block.type === "thinking") {
        if (suppressThinking) continue;
        chunks.push({
          kind: "thinking",
          key,
          thinking: block.thinking,
          isStreaming: isStreamingMessage,
        });
        continue;
      }
      if (block.type === "tool_use") {
        if (block.name === "todo_write") {
          const nextName = applyTodoWrite(block, todoListsByName, chunks);
          if (nextName !== null) {
            currentListName = nextName;
            currentInProgressTodoId = findInProgressTodoId(todoListsByName.get(nextName));
          }
          continue;
        }
        const step: TaskStep = { toolUse: block, toolResult: toolResultLookup.get(block.id) };
        const currentList = currentListName ? todoListsByName.get(currentListName) : undefined;
        const activeTodo = currentList?.todos.find((t) => t.id === currentInProgressTodoId);
        if (activeTodo) {
          activeTodo.steps.push(step);
        } else {
          chunks.push({ kind: "tool", key: `tool:${block.id}`, toolUse: block, toolResult: step.toolResult });
        }
      }
    }
  }

  flushVersionChip();
  return mergeConsecutiveTools(chunks);
}

function mergeConsecutiveTools(chunks: RenderChunk[]): RenderChunk[] {
  const out: RenderChunk[] = [];
  let i = 0;
  while (i < chunks.length) {
    const head = chunks[i];
    if (head.kind !== "tool") {
      out.push(head);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < chunks.length && chunks[j].kind === "tool") j++;
    const run = chunks.slice(i, j) as LooseToolChunk[];
    if (run.length === 1) {
      out.push(run[0]);
    } else {
      out.push({
        kind: "tool-group",
        key: `tool-group:${run[0].toolUse.id}`,
        tools: run.map((c) => ({ toolUse: c.toolUse, toolResult: c.toolResult })),
      });
    }
    i = j;
  }
  return out;
}

interface TodoWriteInput {
  name?: string;
  todos?: Array<{ id: string; content: string; status: TodoStatus }>;
  merge?: boolean;
}

/**
 * Applies one `todo_write` tool_use. A new `name` creates a fresh
 * {@link TodoListChunk}; a known `name` updates its todos in place.
 * Returns the plan name just processed, or null when input is invalid.
 */
function applyTodoWrite(
  block: ToolUseContent,
  todoListsByName: Map<string, TodoListChunk>,
  chunks: RenderChunk[],
): string | null {
  const input = block.input as TodoWriteInput;
  if (!input.name || !input.todos) return null;

  let list = todoListsByName.get(input.name);
  if (!list) {
    list = { kind: "todo-list", key: `plan:${input.name}`, name: input.name, todos: [] };
    todoListsByName.set(input.name, list);
    chunks.push(list);
  }

  if (input.merge === false) {
    // Replace mode: drop todos not present in the new set, keep their steps
    // if they reappear, drop otherwise. We preserve insertion order by
    // starting from the incoming list.
    const stepsById = new Map(list.todos.map((todo) => [todo.id, todo.steps]));
    list.todos = input.todos.map((incoming) => ({
      id: incoming.id,
      content: incoming.content,
      status: incoming.status,
      steps: stepsById.get(incoming.id) ?? [],
    }));
  } else {
    for (const incoming of input.todos) {
      const existing = list.todos.find((todo) => todo.id === incoming.id);
      if (existing) {
        existing.content = incoming.content;
        existing.status = incoming.status;
      } else {
        list.todos.push({
          id: incoming.id,
          content: incoming.content,
          status: incoming.status,
          steps: [],
        });
      }
    }
  }

  return input.name;
}

function findInProgressTodoId(list: TodoListChunk | undefined): string | null {
  if (!list) return null;
  return list.todos.find((todo) => todo.status === "in_progress")?.id ?? null;
}

function sliceFromLastCompaction(messages: StoredMessage[]): StoredMessage[] {
  let lastIndex = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].metadata?.compacted) lastIndex = i;
  }
  return lastIndex < 0 ? messages : messages.slice(lastIndex);
}

function buildToolResultLookup(messages: StoredMessage[]): Map<string, ToolResultContent> {
  const map = new Map<string, ToolResultContent>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const block of message.content) {
      if (block.type === "tool_result") map.set(block.tool_use_id, block);
    }
  }
  return map;
}
