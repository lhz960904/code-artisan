import { useEffect, useState } from "react";
import { Check, ChevronDown, Circle, ListChecks, Loader2, Terminal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_CONFIG } from "@/components/chat/tool-call-item";
import type { TaskStep, TodoItem, TodoListChunk, TodoStatus } from "@/components/chat/message-chunks";

interface TodoListCardProps {
  list: TodoListChunk;
  /** Whether this turn's agent is still actively working — drives spinners / pending step states. */
  isLive?: boolean;
}

export function TodoListCard({ list, isLive }: TodoListCardProps) {
  const completed = list.todos.filter((todo) => todo.status === "completed").length;
  const total = list.todos.length;
  const allDone = total > 0 && completed === total;
  const interrupted = !isLive && list.todos.some((todo) => todo.status === "in_progress");
  const inProgressId = list.todos.find((todo) => todo.status === "in_progress")?.id ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(inProgressId);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (inProgressId) setExpandedId(inProgressId);
  }, [inProgressId]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{list.name}</span>
        {interrupted && (
          <span className="rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-medium text-warning">
            Interrupted
          </span>
        )}
        <span
          className={cn(
            "text-[11px] font-medium",
            allDone ? "text-success" : "text-muted-foreground",
          )}
        >
          {completed}/{total} completed
        </span>
      </div>
      <div>
        {list.todos.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            isLive={isLive}
            open={expandedId === todo.id}
            onToggle={() => setExpandedId((current) => (current === todo.id ? null : todo.id))}
          />
        ))}
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  isLive,
  open,
  onToggle,
}: {
  todo: TodoItem;
  isLive?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const hasSteps = todo.steps.length > 0;

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => hasSteps && onToggle()}
        disabled={!hasSteps}
        className={cn(
          "flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors",
          hasSteps ? "hover:bg-accent/40 cursor-pointer" : "cursor-default",
        )}
      >
        <TodoStatusIndicator status={todo.status} isLive={isLive} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            todo.status === "completed" && "text-muted-foreground",
            todo.status === "in_progress" && "font-medium text-foreground",
            todo.status === "pending" && "text-muted-foreground",
          )}
        >
          {todo.content}
        </span>
        {hasSteps && (
          <>
            <span className="text-[10.5px] text-muted-foreground">{todo.steps.length}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </>
        )}
      </button>
      {open && hasSteps && (
        <div className="border-t border-border/40 bg-muted/20">
          {todo.steps.map((step, index) => (
            <StepRow key={index} step={step} isLive={isLive} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, isLive }: { step: TaskStep; isLive?: boolean }) {
  const [open, setOpen] = useState(false);
  const config = TOOL_CONFIG[step.toolUse.name];
  const Icon = config?.icon ?? Terminal;
  const label = config?.label(step.toolUse.input as Record<string, string>) ?? step.toolUse.name;
  const output = step.toolResult?.content ?? "";
  const hasOutput = output.trim().length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasOutput && setOpen((v) => !v)}
        disabled={!hasOutput}
        className={cn(
          "flex w-full items-center gap-2 pl-10 pr-3.5 py-1.5 text-left transition-colors",
          hasOutput ? "hover:bg-accent/40 cursor-pointer" : "cursor-default",
        )}
      >
        <StepStatusDot step={step} isLive={isLive} />
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground">{label}</span>
      </button>
      {open && hasOutput && (
        <div className="max-h-48 overflow-y-auto border-t border-border/40 px-4 pl-10 py-2">
          <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-muted-foreground">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

function TodoStatusIndicator({ status, isLive }: { status: TodoStatus; isLive?: boolean }) {
  const box = "h-[18px] w-[18px]";
  const icon = "h-3 w-3";

  if (status === "in_progress") {
    return (
      <span className={cn("inline-flex items-center justify-center rounded-full bg-warning/15 text-warning", box)}>
        <Loader2 className={cn(icon, isLive && "animate-spin")} />
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className={cn("inline-flex items-center justify-center rounded-full bg-success/15 text-success", box)}>
        <Check className={icon} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full text-muted-foreground/60", box)}>
      <Circle className={icon} strokeDasharray="2 2" />
    </span>
  );
}

function StepStatusDot({ step, isLive }: { step: TaskStep; isLive?: boolean }) {
  if (!step.toolResult) {
    return <Loader2 className={cn("h-3 w-3 shrink-0 text-warning", isLive && "animate-spin")} />;
  }
  const hasError = step.toolResult.content.trim().startsWith("Error");
  if (hasError) {
    return (
      <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <X className="h-2 w-2" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
      <Check className="h-2 w-2" strokeWidth={3} />
    </span>
  );
}
