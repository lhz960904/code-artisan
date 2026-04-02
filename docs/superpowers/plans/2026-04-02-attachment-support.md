# Attachment Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to upload files (images, PDFs, code, etc.) in chat, stored in Supabase Storage, rendered in the UI, and passed to Claude API as appropriate content blocks.

**Architecture:** Backend receives files via multipart upload, stores in Supabase Storage public bucket, returns fileId. Frontend constructs display URLs from fileId + storage base URL. When sending to Claude API, backend fetches files from storage and converts to appropriate content blocks (image URL, document base64, or text).

**Tech Stack:** Hono (multipart), Supabase Storage, React, TanStack Query, lucide-react

---

### Task 1: Backend — Supabase Storage Service

**Files:**
- Create: `packages/backend/src/services/storage.ts`

- [ ] **Step 1: Create storage service**

```typescript
// packages/backend/src/services/storage.ts
import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";

const BUCKET = "attachments";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);

export interface UploadResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${file.size} bytes (max ${MAX_FILE_SIZE})`);
  }

  const ext = file.name.split(".").pop() ?? "";
  const fileId = `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileId, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return {
    fileId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function getFileBuffer(fileId: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(fileId);

  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
  return data.arrayBuffer();
}

export function getPublicUrl(fileId: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileId);
  return data.publicUrl;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/services/storage.ts
git commit -m "feat: add Supabase Storage service for file upload/download"
```

---

### Task 2: Backend — Upload Route

**Files:**
- Create: `packages/backend/src/routes/upload.ts`
- Modify: `packages/backend/src/index.ts:15`

- [ ] **Step 1: Create upload route**

```typescript
// packages/backend/src/routes/upload.ts
import { Hono } from "hono";
import { uploadFile } from "../services/storage.js";

const uploadRouter = new Hono();

// POST /api/upload — single file multipart upload
uploadRouter.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }

  try {
    const result = await uploadFile(file);
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return c.json({ error: message }, 400);
  }
});

export { uploadRouter };
```

- [ ] **Step 2: Register upload route in index.ts**

Add to `packages/backend/src/index.ts` after the conversations route (line 15):

```typescript
import { uploadRouter } from "./routes/upload.js";
```

And add the route:

```typescript
app.route("/api/upload", uploadRouter);
```

The full modified section of index.ts:

```typescript
import { conversationsRouter } from "./routes/conversations.js";
import { uploadRouter } from "./routes/upload.js";

const app = new Hono();

app.use("*", logger());

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/conversations", conversationsRouter);
app.route("/api/upload", uploadRouter);
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/upload.ts packages/backend/src/index.ts
git commit -m "feat: add POST /api/upload endpoint for file uploads"
```

---

### Task 3: Shared Types — Update SendMessageRequest

**Files:**
- Modify: `packages/shared/src/types.ts:133-135`

- [ ] **Step 1: Add Attachment type and update SendMessageRequest**

Replace the existing `SendMessageRequest` in `packages/shared/src/types.ts`:

```typescript
export interface Attachment {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface SendMessageRequest {
  content: string;
  attachments?: Attachment[];
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add Attachment type and attachments field to SendMessageRequest"
```

---

### Task 4: Backend — Handle Attachments in Send Message

**Files:**
- Modify: `packages/backend/src/routes/conversations.ts:147-181`

- [ ] **Step 1: Update send message handler to process attachments**

Import the storage service and shared types at the top of `packages/backend/src/routes/conversations.ts`:

```typescript
import { getPublicUrl } from "../services/storage.js";
import type { Attachment, MessagePart } from "@code-artisan/shared";
```

Replace the send message handler (line 147-181):

```typescript
// Send message
conversationsRouter.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const { content, attachments } = await c.req.json<{ content: string; attachments?: Attachment[] }>();

  if (!content?.trim() && (!attachments || attachments.length === 0)) {
    return c.json({ error: "Message content or attachments required" }, 400);
  }

  if (attachments && attachments.length > 5) {
    return c.json({ error: "Maximum 5 attachments per message" }, 400);
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const agent = createAgent();

  await db
    .update(conversations)
    .set({ agentRunning: true, updatedAt: new Date() })
    .where(eq(conversations.id, id));

  // Build user message parts from attachments
  const userParts: MessagePart[] = [];

  if (attachments) {
    for (const att of attachments) {
      if (att.mimeType.startsWith("image/")) {
        userParts.push({
          type: "image",
          mediaType: att.mimeType,
          source: { type: "url", url: `files/${att.fileId}` },
        });
      } else if (att.mimeType === "application/pdf") {
        userParts.push({
          type: "document",
          mediaType: att.mimeType,
          title: att.fileName,
          source: { type: "url", url: `files/${att.fileId}` },
        });
      } else {
        // Text/code files and other types — store as document for now,
        // will be converted to text when sending to LLM
        userParts.push({
          type: "document",
          mediaType: att.mimeType,
          title: att.fileName,
          source: { type: "url", url: `files/${att.fileId}` },
        });
      }
    }
  }

  if (content?.trim()) {
    userParts.push({ type: "text", text: content });
  }

  agent.run({ conversationId: id, userMessage: content, userParts: userParts.length > 1 || attachments?.length ? userParts : undefined })
    .catch((err) => {
      console.error(`Agent error for conversation ${id}:`, err);
    })
    .finally(() => {
      db.update(conversations)
        .set({ agentRunning: false })
        .where(eq(conversations.id, id))
        .catch(() => {});
    });

  return c.json({ status: "started" });
});
```

- [ ] **Step 2: Update Agent to accept userParts**

In `packages/backend/src/agent/types.ts`, add `userParts` to `AgentConfig`:

Find the `AgentConfig` interface and add:

```typescript
userParts?: MessagePart[];
```

- [ ] **Step 3: Update Agent.run to use userParts**

In `packages/backend/src/agent/agent.ts`, update the `run` method (around line 43) to use `userParts` when provided:

Replace:

```typescript
const { conversationId, userMessage, maxIterations = 10 } = config;
```

With:

```typescript
const { conversationId, userMessage, userParts, maxIterations = 10 } = config;
```

And replace:

```typescript
if (userMessage) {
  await this.addMessage(runtime, "user", [{ type: "text", text: userMessage }]);
}
```

With:

```typescript
if (userParts) {
  await this.addMessage(runtime, "user", userParts);
} else if (userMessage) {
  await this.addMessage(runtime, "user", [{ type: "text", text: userMessage }]);
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/conversations.ts packages/backend/src/agent/agent.ts packages/backend/src/agent/types.ts
git commit -m "feat: handle attachments in send message route and agent"
```

---

### Task 5: Backend — Anthropic Provider: Convert Attachments to Content Blocks

**Files:**
- Modify: `packages/backend/src/agent/providers/anthropic/index.ts:168-233`

- [ ] **Step 1: Add file resolution helpers**

Add at the bottom of `packages/backend/src/agent/providers/anthropic/index.ts`, before the closing of the file:

```typescript
import { getFileBuffer, getPublicUrl } from "../../../services/storage.js";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "js", "ts", "jsx", "tsx", "py", "rb", "go", "rs",
  "java", "c", "cpp", "h", "hpp", "css", "html", "xml", "yaml", "yml",
  "toml", "ini", "cfg", "sh", "bash", "zsh", "sql", "graphql", "vue",
  "svelte", "astro", "env", "gitignore", "dockerignore", "makefile",
]);

function isTextFile(mimeType: string, fileUrl: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json" || mimeType === "application/xml") return true;
  const ext = fileUrl.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

function extractFileId(url: string): string {
  // url format: "files/{fileId}"
  return url.replace(/^files\//, "");
}

async function resolveImageContent(source: { type: string; url?: string; data?: string }, mediaType: string): Promise<Anthropic.ImageBlockParam> {
  if (source.type === "base64" && source.data) {
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType as Anthropic.Base64ImageSource["media_type"], data: source.data },
    };
  }
  // URL source — use public URL directly
  const fileId = extractFileId(source.url!);
  const publicUrl = getPublicUrl(fileId);
  return {
    type: "image",
    source: { type: "url", url: publicUrl },
  };
}

async function resolveDocumentContent(
  source: { type: string; url?: string; data?: string; text?: string },
  mediaType: string,
  title?: string,
): Promise<Anthropic.ContentBlockParam> {
  const fileId = source.url ? extractFileId(source.url) : "";

  // PDF — fetch and base64 encode
  if (mediaType === "application/pdf") {
    const buffer = await getFileBuffer(fileId);
    const base64 = Buffer.from(buffer).toString("base64");
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
      ...(title && { title }),
    } as Anthropic.ContentBlockParam;
  }

  // Text-like files — read content as text
  if (isTextFile(mediaType, source.url ?? "")) {
    const buffer = await getFileBuffer(fileId);
    const text = new TextDecoder().decode(buffer);
    return {
      type: "text",
      text: title ? `[File: ${title}]\n${text}` : text,
    };
  }

  // Unsupported binary — just describe it
  return {
    type: "text",
    text: `[Unsupported file: ${title ?? fileId}]`,
  };
}
```

- [ ] **Step 2: Update toAnthropicMessages to handle ImagePart and DocumentPart**

Replace the user message handling section in `toAnthropicMessages` (the `if (msg.role === "user")` block, lines 174-182):

```typescript
if (msg.role === "user") {
  if (msg.metadata?.confirmResponse) continue;

  const hasAttachments = msg.parts.some((p) => p.type === "image" || p.type === "document");

  if (!hasAttachments) {
    // Simple text-only message
    const text = msg.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (text) {
      result.push({ role: "user", content: text });
    }
  } else {
    // Message with attachments — build multi-content block
    const contentBlocks: Anthropic.ContentBlockParam[] = [];

    for (const part of msg.parts) {
      if (part.type === "image") {
        const imageBlock = await resolveImageContent(part.source, part.mediaType);
        contentBlocks.push(imageBlock);
      } else if (part.type === "document") {
        const docBlock = await resolveDocumentContent(part.source, part.mediaType, part.title);
        contentBlocks.push(docBlock);
      } else if (part.type === "text" && part.text) {
        contentBlocks.push({ type: "text", text: part.text });
      }
    }

    if (contentBlocks.length > 0) {
      result.push({ role: "user", content: contentBlocks });
    }
  }
}
```

**Important:** This makes `toAnthropicMessages` async. Update the function signature:

```typescript
export async function toAnthropicMessages(messages: Message[]): Promise<Anthropic.MessageParam[]> {
```

And update the call site in the `stream` method (line 41):

```typescript
messages: await toAnthropicMessages(params.messages),
```

And in `generateText` (line 138):

```typescript
messages: await toAnthropicMessages(params.messages),
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/agent/providers/anthropic/index.ts
git commit -m "feat: convert ImagePart/DocumentPart to Claude API content blocks"
```

---

### Task 6: Frontend — Upload API Client

**Files:**
- Create: `packages/frontend/src/lib/apis/upload.ts`
- Modify: `packages/frontend/src/lib/apis/conversations.ts:46-48`

- [ ] **Step 1: Create upload API**

```typescript
// packages/frontend/src/lib/apis/upload.ts
import { API_BASE } from "./client";
import type { Attachment } from "@code-artisan/shared";

export async function uploadFile(file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
    // Don't set Content-Type — browser sets multipart boundary automatically
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error ?? "Upload failed");
  }

  return res.json();
}
```

- [ ] **Step 2: Update sendMessage API to include attachments**

In `packages/frontend/src/lib/apis/conversations.ts`, update the `sendMessage` method:

```typescript
sendMessage: (id: string, content: string, attachments?: Attachment[]) =>
  apiFetch<{ status: string }>(`/conversations/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, attachments }),
  }),
```

Add the import at top:

```typescript
import type { Message, Attachment } from "@code-artisan/shared";
```

Update the `useSendMessage` hook:

```typescript
export function useSendMessage() {
  return useMutation({
    mutationFn: ({ conversationId, content, attachments }: { conversationId: string; content: string; attachments?: Attachment[] }) =>
      conversations.sendMessage(conversationId, content, attachments),
  });
}
```

- [ ] **Step 3: Export from apis barrel**

Check if there's an `index.ts` barrel file in `packages/frontend/src/lib/apis/` and add the export. If it exists, add:

```typescript
export { uploadFile } from "./upload";
```

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/lib/apis/upload.ts packages/frontend/src/lib/apis/conversations.ts
git commit -m "feat: add upload API client and attachments in sendMessage"
```

---

### Task 7: Frontend — useFileUpload Hook

**Files:**
- Create: `packages/frontend/src/hooks/use-file-upload.ts`

- [ ] **Step 1: Create file upload hook**

```typescript
// packages/frontend/src/hooks/use-file-upload.ts
import { useState, useCallback } from "react";
import { uploadFile } from "@/lib/apis/upload";
import type { Attachment } from "@code-artisan/shared";

export interface FileAttachment {
  id: string; // local temp ID
  file: File;
  preview?: string; // object URL for image preview
  status: "pending" | "uploading" | "done" | "error";
  result?: Attachment; // server response after upload
  error?: string;
}

const MAX_FILES = 5;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function useFileUpload() {
  const [files, setFiles] = useState<FileAttachment[]>([]);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) return prev;

      const toAdd = newFiles.slice(0, remaining).map((file): FileAttachment => {
        const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const preview = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        return { id, file, preview, status: "pending" };
      });

      // Validate size
      const valid = toAdd.filter((f) => {
        if (f.file.size > MAX_SIZE) {
          f.status = "error";
          f.error = "File too large (max 10MB)";
        }
        return f.status !== "error";
      });

      return [...prev, ...valid];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const uploadAll = useCallback(async (): Promise<Attachment[]> => {
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) {
      return files.filter((f) => f.result).map((f) => f.result!);
    }

    // Mark all as uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "uploading" as const } : f,
      ),
    );

    const results: Attachment[] = [];

    await Promise.all(
      pending.map(async (fa) => {
        try {
          const result = await uploadFile(fa.file);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fa.id ? { ...f, status: "done" as const, result } : f,
            ),
          );
          results.push(result);
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fa.id
                ? { ...f, status: "error" as const, error: err instanceof Error ? err.message : "Upload failed" }
                : f,
            ),
          );
        }
      }),
    );

    // Collect all successful results (including previously uploaded)
    return [
      ...files.filter((f) => f.status === "done" && f.result).map((f) => f.result!),
      ...results,
    ];
  }, [files]);

  const clear = useCallback(() => {
    setFiles((prev) => {
      for (const f of prev) {
        if (f.preview) URL.revokeObjectURL(f.preview);
      }
      return [];
    });
  }, []);

  const isUploading = files.some((f) => f.status === "uploading");
  const hasFiles = files.length > 0;

  return { files, addFiles, removeFile, uploadAll, clear, isUploading, hasFiles };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/hooks/use-file-upload.ts
git commit -m "feat: add useFileUpload hook for managing file upload state"
```

---

### Task 8: Frontend — AttachmentPreview Component

**Files:**
- Create: `packages/frontend/src/components/chat/attachment-preview.tsx`

- [ ] **Step 1: Create attachment preview component**

```tsx
// packages/frontend/src/components/chat/attachment-preview.tsx
import { X, FileText, FileImage, FileCode, File, Loader2 } from "lucide-react";
import type { FileAttachment } from "@/hooks/use-file-upload";

interface AttachmentPreviewProps {
  files: FileAttachment[];
  onRemove: (id: string) => void;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return FileText;
  if (mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("json")) return FileCode;
  return File;
}

export function AttachmentPreview({ files, onRemove }: AttachmentPreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3">
      {files.map((f) => {
        const Icon = getFileIcon(f.file.type);
        const isImage = f.file.type.startsWith("image/");

        return (
          <div
            key={f.id}
            className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs"
          >
            {/* Thumbnail or icon */}
            {isImage && f.preview ? (
              <img
                src={f.preview}
                alt={f.file.name}
                className="h-8 w-8 rounded object-cover"
              />
            ) : (
              <Icon className="h-4 w-4 text-muted-foreground" />
            )}

            {/* File name */}
            <span className="max-w-[120px] truncate text-foreground">
              {f.file.name}
            </span>

            {/* Upload status */}
            {f.status === "uploading" && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}

            {/* Remove button */}
            <button
              onClick={() => onRemove(f.id)}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/chat/attachment-preview.tsx
git commit -m "feat: add AttachmentPreview component for file chips in chat input"
```

---

### Task 9: Frontend — Update ChatInput with File Upload

**Files:**
- Modify: `packages/frontend/src/components/chat/chat-input.tsx`

- [ ] **Step 1: Rewrite ChatInput to integrate file upload**

Replace the full content of `packages/frontend/src/components/chat/chat-input.tsx`:

```tsx
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
  // File upload integration
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
    // Reset input so same file can be selected again
    e.target.value = "";
  }

  // Paste image from clipboard
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

  // Drag and drop
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
        {/* Attachment preview area (inside card, above textarea) */}
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/chat/chat-input.tsx
git commit -m "feat: integrate file upload into ChatInput (picker, paste, drag-drop)"
```

---

### Task 10: Frontend — Update ChatPanel to Wire Everything Together

**Files:**
- Modify: `packages/frontend/src/components/chat/chat-panel.tsx`

- [ ] **Step 1: Integrate useFileUpload and update send flow**

Replace the full content of `packages/frontend/src/components/chat/chat-panel.tsx`:

```tsx
import { useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useFileUpload } from "@/hooks/use-file-upload";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { useWorkspace } from "@/contexts/workspace-context";
import { useMessages, useSendMessage, fetchMessages } from "@/lib/apis";
import { API_BASE } from "@/lib/apis/client";
import type { Message, Attachment } from "@code-artisan/shared";

interface ChatPanelProps {
  conversationId: string;
  initialMessage?: string;
}

export function ChatPanel({ conversationId, initialMessage }: ChatPanelProps) {
  const { data: fetchedMessages } = useMessages(conversationId);
  const sendMsgApi = useSendMessage();
  const fileUpload = useFileUpload();

  // If navigating from home page with an initial message, show it as optimistic
  const initialMessages = fetchedMessages?.length
    ? fetchedMessages
    : initialMessage
      ? [{ id: `opt-init`, role: "user" as const, parts: [{ type: "text" as const, text: initialMessage }], createdAt: new Date().toISOString() }]
      : undefined;

  const { messages, status, sendMessage: chatSendMessage } =
    useChat(conversationId, {
      initialMessages,
      streamUrl: `${API_BASE}/conversations/${conversationId}/stream`,
      sendMessage: async (id, content, attachments) => {
        await sendMsgApi.mutateAsync({ conversationId: id, content, attachments });
      },
      fetchMessages,
    });
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(new Set<string>());
  const { updateFile, openFile, appendTerminal, setPreviewUrl, loadSnapshots } =
    useWorkspace();

  useEffect(() => {
    loadSnapshots(conversationId);
  }, [conversationId, loadSnapshots]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.id.startsWith("opt-")) continue;
      if (processedRef.current.has(msg.id)) continue;
      processedRef.current.add(msg.id);
      processMessageSideEffects(msg, { updateFile, openFile, appendTerminal, setPreviewUrl });
    }
  }, [messages, updateFile, openFile, appendTerminal, setPreviewUrl]);

  const isBusy = status !== "ready" && status !== "error";

  const handleSend = async (content: string) => {
    let attachments: Attachment[] | undefined;

    if (fileUpload.hasFiles) {
      attachments = await fileUpload.uploadAll();
      fileUpload.clear();
    }

    chatSendMessage(content, attachments);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              conversationId={conversationId}
            />
          ))}

          {isBusy && !messages.some((m) => m.parts.some((p) => "status" in p && p.status === "streaming")) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Working...
            </div>
          )}
        </div>
      </div>

      <ChatInput
        onSend={handleSend}
        disabled={isBusy}
        files={fileUpload.files}
        onAddFiles={fileUpload.addFiles}
        onRemoveFile={fileUpload.removeFile}
        isUploading={fileUpload.isUploading}
      />
    </div>
  );
}

function processMessageSideEffects(
  msg: Message,
  ctx: {
    updateFile: (path: string, content: string) => void;
    openFile: (path: string) => void;
    appendTerminal: (entry: { command: string; output: string }) => void;
    setPreviewUrl: (url: string | null) => void;
  },
) {
  for (const part of msg.parts) {
    if (part.type === "tool-call" && part.state === "call") {
      if (part.toolName === "write_file") {
        const input = part.input as { path: string; content: string };
        if (input.path && input.content) {
          ctx.updateFile(input.path, input.content);
          ctx.openFile(input.path);
        }
      }
    }
    if (part.type === "tool-call" && part.state === "result") {
      if (part.toolName === "bash" && part.output) {
        ctx.appendTerminal({
          command: (part.input as { command: string }).command ?? "command",
          output: part.output,
        });
      }
      if (part.toolName === "read_file" && part.output) {
        const path = (part.input as { path: string }).path;
        if (path) {
          ctx.updateFile(path, part.output);
          ctx.openFile(path);
        }
      }
    }
  }
  if (msg.metadata?.previewUrl) {
    ctx.setPreviewUrl(msg.metadata.previewUrl as string);
  }
}
```

- [ ] **Step 2: Update useChat to support attachments in sendMessage**

In `packages/frontend/src/hooks/use-chat.ts`, update the types and sendMessage:

Update `UseChatOptions.sendMessage` signature (line 16):

```typescript
sendMessage: (conversationId: string, content: string, attachments?: Attachment[]) => Promise<unknown>;
```

Add the import:

```typescript
import type { Message, MessagePart, MessageStreamEvent, TextPart, ThinkingPart, ToolCallPart, Attachment } from "@code-artisan/shared";
```

Update `UseChatReturn.sendMessage` (line 28):

```typescript
sendMessage: (content: string, attachments?: Attachment[]) => void;
```

Update the `sendMessage` callback (around line 285-313):

```typescript
const sendMessage = useCallback(
  async (content: string, attachments?: Attachment[]) => {
    if (!conversationId || sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    // Build optimistic parts
    const optimisticParts: MessagePart[] = [];
    if (attachments) {
      for (const att of attachments) {
        if (att.mimeType.startsWith("image/")) {
          optimisticParts.push({
            type: "image",
            mediaType: att.mimeType,
            source: { type: "url", url: `files/${att.fileId}` },
          });
        } else {
          optimisticParts.push({
            type: "document",
            mediaType: att.mimeType,
            title: att.fileName,
            source: { type: "url", url: `files/${att.fileId}` },
          });
        }
      }
    }
    if (content) {
      optimisticParts.push({ type: "text", text: content });
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `opt-${Date.now()}`,
        role: "user",
        parts: optimisticParts,
        createdAt: new Date().toISOString(),
      } as Message,
    ]);
    setStatus("submitted");
    setError(null);

    try {
      await optionsRef.current.sendMessage(conversationId, content, attachments);
      connectSSE();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setStatus("error");
      setError(error);
      sendInFlightRef.current = false;
      optionsRef.current.onError?.(error);
    }
  },
  [conversationId, connectSSE],
);
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/chat/chat-panel.tsx packages/frontend/src/hooks/use-chat.ts
git commit -m "feat: wire up file upload in ChatPanel and useChat"
```

---

### Task 11: Frontend — Render Attachments in MessageBubble

**Files:**
- Modify: `packages/frontend/src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Update user message rendering to show attachments**

In `packages/frontend/src/components/chat/message-bubble.tsx`, update the imports:

```typescript
import { useState } from "react";
import { ChevronRight, AlertCircle, FileText, FileImage, FileCode, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { ToolCallItem } from "@/components/chat/tool-call-item";
import { ConfirmCard } from "@/components/chat/confirm-card";
import type { Message, MessagePart, ToolCallPart, ImagePart, DocumentPart } from "@code-artisan/shared";
```

Replace the user message rendering block (lines 30-43):

```tsx
// User message
if (message.role === "user") {
  const textParts = message.parts.filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text");
  const imageParts = message.parts.filter((p): p is ImagePart => p.type === "image");
  const docParts = message.parts.filter((p): p is DocumentPart => p.type === "document");
  const text = textParts.map((p) => p.text).join("\n");
  const hasAttachments = imageParts.length > 0 || docParts.length > 0;

  if (!text && !hasAttachments) return null;

  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-2">
        {/* Attachment thumbnails */}
        {hasAttachments && (
          <div className="flex flex-wrap justify-end gap-2">
            {imageParts.map((img, i) => (
              <img
                key={`img-${i}`}
                src={img.source.type === "url" ? resolveFileUrl(img.source.url) : `data:${img.mediaType};base64,${img.source.data}`}
                alt="attachment"
                className="max-h-48 max-w-64 rounded-lg border border-border object-cover"
              />
            ))}
            {docParts.map((doc, i) => (
              <div
                key={`doc-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
              >
                <FileText className="h-4 w-4" />
                {doc.title ?? "Document"}
              </div>
            ))}
          </div>
        )}
        {/* Text content */}
        {text && (
          <div className="rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}
```

Add the URL resolver helper at the bottom of the file:

```typescript
function resolveFileUrl(url: string): string {
  if (url.startsWith("http")) return url;
  // Construct full Supabase Storage URL from "files/{fileId}"
  const baseUrl = import.meta.env.SUPABASE_URL as string;
  const fileId = url.replace(/^files\//, "");
  return `${baseUrl}/storage/v1/object/public/attachments/${fileId}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/chat/message-bubble.tsx
git commit -m "feat: render image and document attachments in user message bubbles"
```

---

### Task 12: Supabase Storage Bucket Setup

This task requires manual setup in the Supabase dashboard or via SQL migration.

- [ ] **Step 1: Create the attachments bucket**

Run via Supabase SQL editor or add a migration:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Set storage policy (allow uploads from backend service role)**

```sql
CREATE POLICY "Allow service role uploads" ON storage.objects
FOR INSERT TO service_role
WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Allow public reads" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'attachments');
```

- [ ] **Step 3: Document in README or .env.example**

No code change needed — just note that the `attachments` bucket must exist with public read access.

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Storage service | `services/storage.ts` | — |
| 2 | Upload route | `routes/upload.ts` | `index.ts` |
| 3 | Shared types | — | `types.ts` |
| 4 | Send message with attachments | — | `conversations.ts`, `agent.ts`, `types.ts` |
| 5 | Anthropic content blocks | — | `anthropic/index.ts` |
| 6 | Upload API client | `apis/upload.ts` | `apis/conversations.ts` |
| 7 | useFileUpload hook | `hooks/use-file-upload.ts` | — |
| 8 | AttachmentPreview component | `chat/attachment-preview.tsx` | — |
| 9 | ChatInput update | — | `chat-input.tsx` |
| 10 | ChatPanel wiring | — | `chat-panel.tsx`, `use-chat.ts` |
| 11 | MessageBubble rendering | — | `message-bubble.tsx` |
| 12 | Supabase bucket setup | — | (manual / SQL) |
