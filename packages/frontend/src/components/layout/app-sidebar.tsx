import { useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Home, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  conversationsListOptions,
  useConversationCreate,
  useConversationDelete,
  useConversationUpdate,
} from "@/api";
import { UserProfile } from "./user-profile";

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const createConversation = useConversationCreate();
  const deleteConversation = useConversationDelete();
  const updateConversation = useConversationUpdate();
  const { data: conversations } = useSuspenseQuery(conversationsListOptions());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const originalTitleRef = useRef("");
  const commitHandledRef = useRef(false);

  async function handleNewChat() {
    const conversation = await createConversation.mutateAsync();
    navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
  }

  function askDelete(e: React.MouseEvent, conversationId: string) {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteId(conversationId);
  }

  function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    deleteConversation.mutate(id);
    setPendingDeleteId(null);
    if (location.pathname.includes(id)) {
      navigate({ to: "/dashboard" });
    }
  }

  function startEdit(e: React.MouseEvent, conversationId: string, currentTitle: string | null) {
    e.preventDefault();
    e.stopPropagation();
    originalTitleRef.current = currentTitle ?? "";
    commitHandledRef.current = false;
    setEditingValue(currentTitle ?? "");
    setEditingId(conversationId);
  }

  function commitEdit() {
    if (commitHandledRef.current || !editingId) return;
    commitHandledRef.current = true;
    const next = editingValue.trim();
    if (next && next !== originalTitleRef.current) {
      updateConversation.mutate({ id: editingId, title: next });
    }
    setEditingId(null);
  }

  function cancelEdit() {
    commitHandledRef.current = true;
    setEditingId(null);
  }

  const pendingTitle =
    conversations.find((c) => c.id === pendingDeleteId)?.title || "Untitled";

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="p-3">
        <Button variant="outline" className="w-full gap-2" onClick={handleNewChat} disabled={createConversation.isPending}>
          <Plus className="h-4 w-4" /> New Chat
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
        >
          <Home className="h-4 w-4" /> Home
        </Link>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</div>
        <div className="space-y-0.5">
          {conversations.map((conversation) => {
            if (editingId === conversation.id) {
              return (
                <div
                  key={conversation.id}
                  className="flex items-center rounded-md bg-accent px-2 py-1.5 text-sm text-accent-foreground"
                >
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      // Skip Enter while an IME is still composing — lets
                      // the input method commit its candidate instead of
                      // firing the rename.
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        commitEdit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </div>
              );
            }
            return (
              <Link
                key={conversation.id}
                to="/chat/$conversationId"
                params={{ conversationId: conversation.id }}
                className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
              >
                <span className="truncate">{conversation.title || "Untitled"}</span>
                <div className="ml-1 hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <button
                    onClick={(e) => startEdit(e, conversation.id, conversation.title)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    title="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => askDelete(e, conversation.id)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      </ScrollArea>

      <UserProfile />

      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{pendingTitle}</span> and all its
              messages will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AppSidebarSkeleton() {
  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="p-3">
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="px-3 pb-2">
        <Skeleton className="h-7 w-full" />
      </div>
      <div className="min-h-0 flex-1 space-y-1 px-3">
        <Skeleton className="mb-2 h-3 w-16" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
      <UserProfile />
    </div>
  );
}
