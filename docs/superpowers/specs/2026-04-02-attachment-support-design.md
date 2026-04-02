# Attachment Support Design

## Overview

Enable users to upload files (images, PDFs, code files, etc.) in chat, which are then processed and sent to the Claude API as appropriate content blocks.

## Constraints

- Max 5 files per message
- Max 10MB per file
- Storage: Supabase Storage (public bucket)
- Upload flow: Frontend → Backend API → Supabase Storage

## File Type Mapping

| MIME Type | MessagePart | Claude API Content Block |
|-----------|-------------|--------------------------|
| `image/*` | ImagePart | image content block (URL source) |
| `application/pdf` | DocumentPart | document content block (base64, fetched from storage) |
| Text files (.ts/.js/.py/.json/.md/.txt etc.) | TextPart | text content block (file content read as UTF-8) |
| Other binary | TextPart | text content block (file name + size info, unsupported hint) |

## Storage Strategy

- Files stored in Supabase Storage public bucket
- Upload returns `fileId` (unique identifier, e.g. UUID + original extension)
- MessagePart stores fileId in source: `{ type: "url", url: "files/{fileId}" }`
- Frontend constructs full URL: `${STORAGE_BASE_URL}/${fileId}`
- Switching storage providers only requires changing the base URL config
- Claude API integration: backend reads file from storage by fileId, converts per type mapping above

## Data Model

No new DB tables. Attachments are stored as MessagePart entries in the existing `parts` JSONB column.

**User message with attachments example:**

```json
{
  "role": "user",
  "parts": [
    {
      "type": "image",
      "mediaType": "image/png",
      "source": { "type": "url", "url": "files/abc123.png" }
    },
    {
      "type": "document",
      "mediaType": "application/pdf",
      "title": "report.pdf",
      "source": { "type": "url", "url": "files/def456.pdf" }
    },
    {
      "type": "text",
      "text": "帮我分析这个截图和报告"
    }
  ]
}
```

## API Changes

### New: `POST /api/upload`

Multipart form data endpoint.

**Request:** `multipart/form-data` with field `file` (single file per request)

**Validation:**
- File size ≤ 10MB
- MIME type detection (via file header, not just extension)

**Response:**
```json
{
  "fileId": "abc123.png",
  "fileName": "screenshot.png",
  "mimeType": "image/png",
  "size": 204800
}
```

**Flow:** Receive file → validate → generate fileId (UUID + extension) → upload to Supabase Storage → return metadata.

### Modified: `POST /conversations/:id/messages`

`SendMessageRequest` adds optional `attachments` field:

```typescript
interface SendMessageRequest {
  content: string
  attachments?: Array<{
    fileId: string
    fileName: string
    mimeType: string
    size: number
  }>
}
```

Backend constructs MessageParts from attachments based on mimeType mapping, prepends them before the text part, then creates the user message.

### Anthropic Provider: `toAnthropicMessages`

Handle ImagePart and DocumentPart conversion:

- **ImagePart** with URL source: pass URL directly to Claude API (supports image URL source)
- **DocumentPart** with URL source: fetch file from storage → base64 encode → send as document content block
- **TextPart** from text files: already text, pass through as-is

## Frontend Changes

### ChatInput Component

- Wire up existing "Attach File" in Plus menu to open file picker (`accept="*/*"`, `multiple`, max 5)
- Support paste image from clipboard (`onPaste` handler)
- Support drag-and-drop onto input area (drop zone highlight)
- Track selected files in local state: `attachments: FileAttachment[]`
- On send: upload each file via `POST /api/upload`, collect fileIds, then call `sendMessage` with attachments
- Show upload progress indicator per file
- Disable send button while uploads in progress

### AttachmentPreview Component (new)

- Rendered inside ChatInput, above the textarea
- Horizontal list of attachment chips
- Each chip shows: file type icon + file name + remove button
- Image files show small thumbnail preview
- Upload progress bar per file (while uploading)

### MessageBubble Component

- User messages: render ImagePart as inline image thumbnail (clickable to expand), DocumentPart as file chip with icon
- No changes needed for assistant messages (agent doesn't produce attachments)

### API Client

New mutation: `useUploadFile()` — calls `POST /api/upload` with FormData.

## File Structure (new/modified)

```
packages/backend/src/
  routes/upload.ts              # NEW: upload endpoint
  services/storage.ts           # NEW: Supabase Storage service (upload, getUrl, getFile)

packages/frontend/src/
  components/chat/chat-input.tsx          # MODIFIED: file picker, paste, drag-drop
  components/chat/attachment-preview.tsx   # NEW: attachment chips in input
  components/chat/message-bubble.tsx       # MODIFIED: render image/document parts
  lib/apis/upload.ts                      # NEW: upload API client
  hooks/use-file-upload.ts                # NEW: upload state management hook

packages/shared/src/
  types.ts                                # MODIFIED: SendMessageRequest.attachments
```
