import { useState, useRef, useEffect } from "react";
import { Send, Square, Plus, Paperclip, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSendMessage } from "@/lib/apis";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  conversationId: string;
  disabled?: boolean;
}

export function ChatInput({ conversationId, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const sendMsg = useSendMessage();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    if (!content || sendMsg.isPending || disabled) return;
    setInput("");
    sendMsg.mutate({ conversationId, content });
  }

  return (
    <div className="border-t border-border p-3">
      <div className="rounded-xl border border-border bg-card">
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
                  <MenuItem icon={<Paperclip className="h-4 w-4" />} label="Attach file" disabled />
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
              disabled={sendMsg.isPending || !input.trim()}
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
