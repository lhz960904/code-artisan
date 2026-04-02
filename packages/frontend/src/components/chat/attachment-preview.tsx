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
            {isImage && f.preview ? (
              <img
                src={f.preview}
                alt={f.file.name}
                className="h-8 w-8 rounded object-cover"
              />
            ) : (
              <Icon className="h-4 w-4 text-muted-foreground" />
            )}

            <span className="max-w-[120px] truncate text-foreground">
              {f.file.name}
            </span>

            {f.status === "uploading" && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}

            {f.status === "error" && (
              <span className="text-destructive" title={f.error}>!</span>
            )}

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
