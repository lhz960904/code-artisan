import { useRef, useEffect, useCallback, useState } from "react";
import {
  Plus,
  Paperclip,
  ChevronDown,
  Lock,
  ArrowRight,
  Send,
  Loader2,
  Square,
  Wand2,
} from "lucide-react";
import type { ModelInfo, ModelProvider } from "@code-artisan/shared";
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
import anthropicIcon from "@/assets/model-icons/anthropic.svg";
import moonshotIcon from "@/assets/model-icons/moonshot.svg";

const PROVIDER_ICON: Record<ModelProvider, string> = {
  anthropic: anthropicIcon,
  moonshot: moonshotIcon,
};

export interface SenderProps {
  value?: string;
  onChange?: (v: string) => void;
  onSubmit: (content: string) => void | Promise<void>;

  busy?: boolean;
  /** When set and `busy`, the send button turns into a stop button that invokes this callback. */
  onStop?: () => void;
  placeholder?: string;
  autoFocus?: boolean;

  files?: FileAttachment[];
  onAddFiles?: (f: File[]) => void;
  onRemoveFile?: (id: string) => void;
  isUploading?: boolean;

  models: ModelInfo[];
  modelId: string;
  onModelChange: (id: string) => void;

  size?: "default" | "large";
  submitLabel?: string;
  className?: string;
}

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

function ProviderIcon({ provider, className }: { provider: ModelProvider; className?: string }) {
  return <img src={PROVIDER_ICON[provider]} alt={provider} className={cn("size-4 rounded-sm", className)} />;
}

function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: ModelInfo[];
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
          className="gap-1.5 rounded-md font-display text-xs text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          {selected && <ProviderIcon provider={selected.provider} className="size-3.5" />}
          {selected?.label}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-65 p-1.5">
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
              <ProviderIcon provider={m.provider} />
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
  onStop,
}: {
  size: "default" | "large";
  label?: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
  onStop?: () => void;
}) {
  // While busy, if the caller wired up onStop, the button acts as a Stop
  // button — clickable, not disabled.
  const isStopMode = busy && !!onStop;
  const actualDisabled = disabled && !isStopMode;

  const handleClick = () => {
    if (isStopMode) onStop!();
    else onClick();
  };

  if (size === "large") {
    return (
      <button
        type="button"
        disabled={actualDisabled}
        onClick={handleClick}
        aria-label={isStopMode ? "Stop generation" : "Send message"}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 font-display text-sm font-semibold text-primary-foreground transition-opacity",
          actualDisabled ? "cursor-not-allowed opacity-60" : "hover:opacity-90",
        )}
      >
        {isStopMode ? (
          <>
            Stop
            <Square className="size-3.5 fill-current" />
          </>
        ) : busy ? (
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
      disabled={actualDisabled}
      onClick={handleClick}
      aria-label={isStopMode ? "Stop generation" : "Send message"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
        actualDisabled ? "cursor-not-allowed opacity-60" : "hover:opacity-90",
      )}
    >
      {isStopMode ? (
        <Square className="size-3.5 fill-current" />
      ) : busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Send className="size-4" />
      )}
    </button>
  );
}

// ----- main component -----

export function Sender({
  value: valueProp,
  onChange,
  onSubmit,
  busy,
  onStop,
  placeholder = "How can CodeArtisan help you today?",
  autoFocus,
  files = [],
  onAddFiles,
  onRemoveFile,
  isUploading,
  models,
  modelId,
  onModelChange,
  size = "default",
  submitLabel,
  className,
}: SenderProps) {
  const [inner, setInner] = useState("");
  const value = valueProp ?? inner;
  const isControlled = valueProp !== undefined;

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
          // `isComposing` is true while an IME (e.g. 拼音, 假名, hangul) is
          // still assembling a character. Enter in that state means "commit
          // the candidate", not "submit the message" — skip so the browser
          // can finish composition and the text stays in the field.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
          <ModelPicker models={models} value={modelId} onChange={onModelChange} />
        </div>
        <SendButton
          size={size}
          label={submitLabel}
          disabled={!canSubmit}
          busy={Boolean(busy || isUploading)}
          onClick={handleSubmit}
          onStop={onStop}
        />
      </div>
    </div>
  );
}
