import { describe, expect, it } from "vitest";
import {
  decryptString,
  encryptString,
  isEncryptedBlob,
} from "../../src/services/integration/crypto.js";

describe("integration crypto", () => {
  it("round-trips a plain string", async () => {
    const blob = await encryptString("hello world");
    const out = await decryptString(blob);
    expect(out).toBe("hello world");
  });

  it("round-trips an OAuth-shaped JSON payload", async () => {
    const token = {
      access_token: "abc123",
      refresh_token: "xyz789",
      expires_at: 1730000000000,
      user_name: "haoze",
    };
    const blob = await encryptString(JSON.stringify(token));
    const out = JSON.parse(await decryptString(blob));
    expect(out).toEqual(token);
  });

  it("produces a fresh IV per encryption", async () => {
    const a = await encryptString("same");
    const b = await encryptString("same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("rejects tampered ciphertext", async () => {
    const blob = await encryptString("secret");
    const tampered = { ...blob, data: blob.data.slice(0, -4) + "AAAA" };
    await expect(decryptString(tampered)).rejects.toThrow();
  });

  it("isEncryptedBlob narrows correctly", () => {
    expect(isEncryptedBlob({ iv: "x", data: "y" })).toBe(true);
    expect(isEncryptedBlob({ iv: "x" })).toBe(false);
    expect(isEncryptedBlob(null)).toBe(false);
    expect(isEncryptedBlob("string")).toBe(false);
  });
});
