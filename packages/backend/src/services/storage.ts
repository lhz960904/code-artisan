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
