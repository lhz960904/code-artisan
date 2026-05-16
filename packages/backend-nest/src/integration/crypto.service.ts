import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema.js";

export interface EncryptedBlob {
  iv: string;
  data: string;
}

@Injectable()
export class CryptoService {
  private cachedKey: CryptoKey | null = null;

  constructor(private readonly cfg: ConfigService<Env, true>) {}

  private async getKey(): Promise<CryptoKey> {
    if (this.cachedKey) return this.cachedKey;
    const secret = this.cfg.get("INTEGRATION_SECRET_KEY", { infer: true });
    if (!secret) {
      throw new InternalServerErrorException(
        "INTEGRATION_SECRET_KEY is not configured — OAuth integrations disabled. " +
          "Generate one with `openssl rand -base64 32` and add to .env.",
      );
    }
    const raw = Buffer.from(secret, "base64");
    if (raw.byteLength !== 32) {
      throw new InternalServerErrorException("INTEGRATION_SECRET_KEY must decode to 32 bytes (AES-256)");
    }
    this.cachedKey = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    return this.cachedKey;
  }

  async encryptString(plain: string): Promise<EncryptedBlob> {
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plain),
    );
    return {
      iv: Buffer.from(iv).toString("base64"),
      data: Buffer.from(new Uint8Array(data)).toString("base64"),
    };
  }

  async decryptString(blob: EncryptedBlob): Promise<string> {
    const key = await this.getKey();
    const iv = Buffer.from(blob.iv, "base64");
    const data = Buffer.from(blob.data, "base64");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(plain);
  }

  isEncryptedBlob(value: unknown): value is EncryptedBlob {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as EncryptedBlob).iv === "string" &&
      typeof (value as EncryptedBlob).data === "string"
    );
  }
}
