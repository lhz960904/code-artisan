import { useState, useCallback } from "react";
import { uploadFile } from "@/lib/apis/upload";
import type { Attachment } from "@code-artisan/shared";

export interface FileAttachment {
  id: string;
  file: File;
  preview?: string;
  status: "pending" | "uploading" | "done" | "error";
  result?: Attachment;
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

        if (file.size > MAX_SIZE) {
          return { id, file, preview, status: "error", error: "File too large (max 10MB)" };
        }

        return { id, file, preview, status: "pending" };
      });

      return [...prev, ...toAdd];
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
    const alreadyDone = files.filter((f) => f.status === "done" && f.result).map((f) => f.result!);

    if (pending.length === 0) return alreadyDone;

    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "uploading" as const } : f,
      ),
    );

    const results: Attachment[] = [...alreadyDone];

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

    return results;
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
