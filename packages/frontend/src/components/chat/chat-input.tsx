import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square, Plus, Paperclip, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AttachmentPreview } from "@/components/chat/attachment-preview";
import type { FileAttachment } from "@/hooks/use-file-upload";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  sending?: boolean;
  files?: FileAttachment[];
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (id: string) => void;
  isUploading?: boolean;
}

export function ChatInput({
  onSend,
  disabled,
  sending,
  files = [],
  onAddFiles,
  onRemoveFile,
  isUploading,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function handleSend() {
    const content = input.trim();
    if ((!content && files.length === 0) || sending || disabled || isUploading) return;
    setInput("");
    onSend(content);
  }

  function handleFileSelect() {
    fileInputRef.current?.click();
    setMenuOpen(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (fileList && onAddFiles) {
      onAddFiles(Array.from(fileList));
    }
    e.target.value = "";
  }

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || !onAddFiles) return;

      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        onAddFiles(imageFiles);
      }
    },
    [onAddFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!onAddFiles) return;
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        onAddFiles(droppedFiles);
      }
    },
    [onAddFiles],
  );

  return (
    <div className="border-t border-border p-3">
      <div
        className={cn(
          "rounded-xl border bg-card transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Attachment preview area */}
        <AttachmentPreview files={files} onRemove={onRemoveFile ?? (() => {})} />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Textarea area */}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          onPaste={handlePaste}
          placeholder="How can CodeArtisan help you today?"
          disabled={disabled}
          rows={3}
          className="min-h-[80px] resize-none border-0 bg-transparent px-4 pt-3 pb-2 text-sm shadow-none focus-visible:ring-0"
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2.5">
          <div className="flex items-center gap-1">
            {/* Plus menu */}
            <div className="relative" ref={menuRef}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <Plus className="h-4 w-4" />
              </Button>

              {/* Dropdown menu */}
              {menuOpen && (
                <div className="absolute bottom-10 left-0 z-50 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
                  <MenuItem
                    icon={<Paperclip className="h-4 w-4" />}
                    label="Attach file"
                    onClick={handleFileSelect}
                  />
                  <MenuItem icon={<Sparkles className="h-4 w-4" />} label="Enhance prompt" disabled />
                </div>
              )}
            </div>

            {/* Model selector (placeholder) */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
              disabled
            >
              <Sparkles className="h-3.5 w-3.5" />
              Sonnet 4
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>

          {/* Right side: send/stop */}
          {disabled ? (
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full"
              disabled
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={handleSend}
              disabled={sending || isUploading || (!input.trim() && files.length === 0)}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        disabled
          ? "text-muted-foreground opacity-50 cursor-not-allowed"
          : "text-popover-foreground hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
