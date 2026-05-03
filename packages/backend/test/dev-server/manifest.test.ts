import { describe, it, expect } from "vitest";
import { manifestSchema, normalizeDevCommand } from "../../src/services/dev-server/manifest";

describe("manifestSchema", () => {
  it("accepts minimal manifest with string dev command", () => {
    const result = manifestSchema.safeParse({
      version: 1,
      scripts: { dev: "pnpm dev" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts full manifest with object dev command", () => {
    const result = manifestSchema.safeParse({
      version: 1,
      name: "my-app",
      scripts: {
        install: "pnpm install",
        dev: { command: "pnpm dev", cwd: ".", port: 5173 },
        build: { command: "pnpm build", output: "dist" },
      },
      deploy: { type: "static", buildOutput: "dist" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown version (forward-compat guard)", () => {
    const result = manifestSchema.safeParse({ version: 2, scripts: { dev: "pnpm dev" } });
    expect(result.success).toBe(false);
  });

  it("rejects empty dev command string", () => {
    const result = manifestSchema.safeParse({ version: 1, scripts: { dev: "" } });
    expect(result.success).toBe(false);
  });

  it("rejects port out of range", () => {
    const result = manifestSchema.safeParse({
      version: 1,
      scripts: { dev: { command: "pnpm dev", port: 99999 } },
    });
    expect(result.success).toBe(false);
  });
});

describe("normalizeDevCommand", () => {
  it("returns null for undefined", () => {
    expect(normalizeDevCommand(undefined)).toBeNull();
  });

  it("wraps a string into { command }", () => {
    expect(normalizeDevCommand("pnpm dev")).toEqual({ command: "pnpm dev" });
  });

  it("passes through object form", () => {
    const dev = { command: "pnpm dev", port: 5173, cwd: "apps/web" };
    expect(normalizeDevCommand(dev)).toEqual(dev);
  });
});
