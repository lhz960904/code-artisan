import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.schema.js";

const BUCKET = "attachments";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface UploadInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  size: number;
}

export interface UploadResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class StorageService {
  private readonly supabase: SupabaseClient;

  constructor(cfg: ConfigService<Env, true>) {
    this.supabase = createClient(
      cfg.get("SUPABASE_URL", { infer: true }),
      cfg.get("SUPABASE_SECRET_KEY", { infer: true }),
    );
  }

  async uploadFile(input: UploadInput): Promise<UploadResult> {
    if (input.size > MAX_FILE_SIZE) {
      throw new InternalServerErrorException(
        `File too large: ${input.size} bytes (max ${MAX_FILE_SIZE})`,
      );
    }
    const ext = input.filename.split(".").pop() ?? "";
    const fileId = `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    const { error } = await this.supabase.storage.from(BUCKET).upload(fileId, input.buffer, {
      contentType: input.mimeType,
      upsert: false,
    });
    if (error) {
      throw new InternalServerErrorException(`Storage upload failed: ${error.message}`);
    }
    return {
      fileId,
      fileName: input.filename,
      mimeType: input.mimeType || "application/octet-stream",
      size: input.size,
    };
  }

  async getFileBuffer(fileId: string): Promise<ArrayBuffer> {
    const { data, error } = await this.supabase.storage.from(BUCKET).download(fileId);
    if (error || !data) {
      throw new InternalServerErrorException(`Storage download failed: ${error?.message ?? "no data"}`);
    }
    return data.arrayBuffer();
  }

  getPublicUrl(fileId: string): string {
    const { data } = this.supabase.storage.from(BUCKET).getPublicUrl(fileId);
    return data.publicUrl;
  }
}
