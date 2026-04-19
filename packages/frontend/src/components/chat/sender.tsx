import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  Paperclip,
  Sparkles,
  ChevronDown,
  Lock,
  ArrowRight,
  Send,
  Loader2,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AttachmentPreview } from "@/components/chat/attachment-preview";
import type { FileAttachment } from "@/hooks/use-file-upload";

export interface ModelOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  locked?: boolean;
}

export interface SenderProps {
  value?: string;
  onChange?: (v: string) => void;
  onSubmit: (content: string) => void | Promise<void>;

  busy?: boolean;
  placeholder?: string;
  autoFocus?: boolean;

  files?: FileAttachment[];
  onAddFiles?: (f: File[]) => void;
  onRemoveFile?: (id: string) => void;
  isUploading?: boolean;

  models?: ModelOption[];
  modelId?: string;
  defaultModelId?: string;
  onModelChange?: (id: string) => void;

  size?: "default" | "large";
  submitLabel?: string;
  className?: string;
}

const DEFAULT_MODELS: ModelOption[] = [
  { id: "sonnet-4-6", label: "Sonnet 4.6" },
  { id: "haiku-4-5", label: "Haiku 4.5", locked: true },
  { id: "opus-4-6", label: "Opus 4.6", locked: true },
  { id: "opus-4-7", label: "Opus 4.7", locked: true },
  { id: "codex", label: "Codex", locked: true },
];

// ----- file-local hooks -----

function useAutoResize(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  min: number,
  max: number,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, min), max);
    el.style.height = `${next}px`;
  }, [ref, value, min, max]);
}

// ----- subcomponents -----

function PlusMenu({ onAttach }: { onAttach: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="More actions"
          className="rounded-full text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuItem onSelect={onAttach}>
          <Paperclip />
          Attach file
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Wand2 />
          Enhance prompt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = models.find((m) => m.id === value) ?? models[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Select model"
          className="gap-1 rounded-md font-display text-xs text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <Sparkles className="size-3.5 text-primary" />
          {selected?.label}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60 p-1.5">
        {models.map((m) => {
          const isActive = m.id === value;
          return (
            <DropdownMenuItem
              key={m.id}
              disabled={m.locked}
              onSelect={() => {
                if (!m.locked) onChange(m.id);
              }}
              className="gap-2 px-2.5 py-2"
            >
              <Sparkles className="!text-primary" />
              <span className="flex-1 text-left">{m.label}</span>
              {isActive && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-primary">
                  ACTIVE
                </span>
              )}
              {m.locked && <Lock className="size-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SendButton({
  size,
  label,
  disabled,
  busy,
  onClick,
}: {
  size: "default" | "large";
  label?: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  if (size === "large") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 font-display text-sm font-semibold text-primary-foreground transition-opacity",
          disabled ? "cursor-not-allowed opacity-60" : "hover:opacity-90",
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            {label ?? "Send"}
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label="Send message"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
        disabled ? "cursor-not-allowed opacity-60" : "hover:opacity-90",
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
    </button>
  );
}

// ----- main component -----

export function Sender({
  value: valueProp,
  onChange,
  onSubmit,
  busy,
  placeholder = "How can CodeArtisan help you today?",
  autoFocus,
  files = [],
  onAddFiles,
  onRemoveFile,
  isUploading,
  models = DEFAULT_MODELS,
  modelId: modelIdProp,
  defaultModelId = "sonnet-4-6",
  onModelChange,
  size = "default",
  submitLabel,
  className,
}: SenderProps) {
  const [inner, setInner] = useState("");
  const value = valueProp ?? inner;
  const isControlled = valueProp !== undefined;

  const [modelIdInner, setModelIdInner] = useState(defaultModelId);
  const modelId = modelIdProp ?? modelIdInner;

  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLarge = size === "large";

  useAutoResize(textareaRef, value, isLarge ? 96 : 56, isLarge ? 240 : 180);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const setValue = (v: string) => {
    if (!isControlled) setInner(v);
    onChange?.(v);
  };

  const canSubmit = !busy && !isUploading && (value.trim() !== "" || files.length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    const content = value.trim();
    if (!isControlled) setInner("");
    else onChange?.("");
    try {
      await onSubmit(content);
    } finally {
      textareaRef.current?.focus();
    }
  }

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || !onAddFiles) return;
      const images: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) images.push(f);
        }
      }
      if (images.length > 0) {
        e.preventDefault();
        onAddFiles(images);
      }
    },
    [onAddFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!onAddFiles) return;
      e.preventDefault();
      setIsDragging(true);
    },
    [onAddFiles],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!onAddFiles) return;
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length > 0) onAddFiles(dropped);
    },
    [onAddFiles],
  );

  const handleModelChange = (id: string) => {
    if (modelIdProp === undefined) setModelIdInner(id);
    onModelChange?.(id);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "group/sender w-full rounded-[20px] bg-card transition-shadow",
        "shadow-[0_0_0_1px_hsl(var(--border))]",
        "focus-within:shadow-[0_0_0_1px_hsl(var(--ring)/0.5),0_0_0_4px_hsl(var(--ring)/0.12)]",
        isDragging && "ring-2 ring-primary bg-primary/5",
        isLarge ? "p-4" : "p-3",
        className,
      )}
    >
      <AttachmentPreview
        files={files}
        onRemove={onRemoveFile ?? (() => { })}
        className={files.length > 0 ? "mb-2" : ""}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = e.target.files;
          if (list && onAddFiles) onAddFiles(Array.from(list));
          e.target.value = "";
        }}
      />

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={placeholder}
        rows={isLarge ? 3 : 2}
        className={cn(
          "w-full resize-none border-0 bg-transparent font-body text-[15px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground",
          isLarge ? "min-h-[96px] px-1 py-1" : "min-h-[56px] px-2 py-1",
        )}
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <PlusMenu onAttach={() => fileInputRef.current?.click()} />
          <ModelPicker models={models} value={modelId} onChange={handleModelChange} />
        </div>
        <SendButton
          size={size}
          label={submitLabel}
          disabled={!canSubmit}
          busy={Boolean(busy || isUploading)}
          onClick={handleSubmit}
        />
      </div>
    </div>
  );
}
