import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFile } from "@/api";
import type { Attachment } from "@code-artisan/shared";

export interface FileAttachment {
  id: string;
  file?: File;
  preview?: string;
  status: "uploading" | "done" | "error";
  result?: Attachment;
  error?: string;
}

const MAX_FILES = 5;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function makeId() {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useFileUpload() {
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const filesCountRef = useRef(0);

  useEffect(() => {
    filesCountRef.current = files.length;
  }, [files]);

  const addFiles = useCallback((newFiles: File[]) => {
    const remaining = MAX_FILES - filesCountRef.current;
    if (remaining <= 0) return;

    const entries: FileAttachment[] = newFiles.slice(0, remaining).map((file) => {
      const id = makeId();
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;

      if (file.size > MAX_SIZE) {
        return { id, file, preview, status: "error", error: "File too large (max 10MB)" };
      }
      return { id, file, preview, status: "uploading" };
    });

    setFiles((prev) => [...prev, ...entries]);
    filesCountRef.current += entries.length;

    // Fire uploads outside the setState updater so StrictMode's double-run
    // doesn't dispatch two requests per file.
    for (const entry of entries) {
      if (entry.status !== "uploading" || !entry.file) continue;
      uploadFile(entry.file)
        .then((result) => {
          setFiles((curr) =>
            curr.map((f) => (f.id === entry.id ? { ...f, status: "done", result } : f)),
          );
        })
        .catch((err) => {
          setFiles((curr) =>
            curr.map((f) =>
              f.id === entry.id
                ? { ...f, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
                : f,
            ),
          );
        });
    }
  }, []);

  const seedUploaded = useCallback((attachments: Attachment[]) => {
    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      const incoming = attachments.slice(0, Math.max(0, remaining)).map(
        (a): FileAttachment => ({ id: makeId(), status: "done", result: a }),
      );
      return [...prev, ...incoming];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setFiles((prev) => {
      for (const f of prev) {
        if (f.preview) URL.revokeObjectURL(f.preview);
      }
      return [];
    });
  }, []);

  const attachments: Attachment[] = files
    .filter((f) => f.status === "done" && f.result)
    .map((f) => f.result!);

  const isUploading = files.some((f) => f.status === "uploading");
  const hasFiles = files.length > 0;

  return {
    files,
    attachments,
    addFiles,
    seedUploaded,
    removeFile,
    clear,
    isUploading,
    hasFiles,
  };
}
