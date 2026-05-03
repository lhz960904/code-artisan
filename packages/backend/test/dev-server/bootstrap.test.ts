import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  __resetBootstrapStateForTest,
  buildBootCommand,
  memoizedBootstrap,
} from "../../src/services/dev-server/bootstrap";
import type { Manifest } from "../../src/services/dev-server/manifest";

const okResult = { sessionId: "sid", command: "pnpm dev", cwd: "/home/user/project" };

describe("buildBootCommand", () => {
  it("composes `install && dev` when install is declared", () => {
    const manifest: Manifest = {
      version: 1,
      scripts: { install: "pnpm install", dev: "pnpm dev" },
    };
    expect(buildBootCommand(manifest, { command: "pnpm dev" })).toBe("pnpm install && pnpm dev");
  });

  it("returns dev alone when install is not declared", () => {
    const manifest: Manifest = { version: 1, scripts: { dev: "pnpm dev" } };
    expect(buildBootCommand(manifest, { command: "pnpm dev" })).toBe("pnpm dev");
  });

  it("uses arbitrary install commands verbatim (e.g. monorepo install)", () => {
    const manifest: Manifest = {
      version: 1,
      scripts: { install: "pnpm -r install --frozen-lockfile", dev: "pnpm dev" },
    };
    expect(buildBootCommand(manifest, { command: "pnpm dev" })).toBe(
      "pnpm -r install --frozen-lockfile && pnpm dev",
    );
  });
});

describe("memoizedBootstrap", () => {
  beforeEach(() => {
    __resetBootstrapStateForTest();
  });

  it("runs fn on first call and caches success", async () => {
    const fn = vi.fn(async () => okResult);
    const r1 = await memoizedBootstrap("sandbox-1", fn);
    const r2 = await memoizedBootstrap("sandbox-1", fn);

    expect(r1).toEqual(okResult);
    expect(r2).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache null returns (manifest not ready yet)", async () => {
    const fn = vi
      .fn<() => Promise<typeof okResult | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(okResult);

    const first = await memoizedBootstrap("sandbox-1", fn);
    const second = await memoizedBootstrap("sandbox-1", fn);

    expect(first).toBeNull();
    expect(second).toEqual(okResult);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT cache thrown errors — next call retries", async () => {
    const fn = vi
      .fn<() => Promise<typeof okResult>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(okResult);

    await expect(memoizedBootstrap("sandbox-1", fn)).rejects.toThrow("boom");
    const r2 = await memoizedBootstrap("sandbox-1", fn);
    expect(r2).toEqual(okResult);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent calls — fn runs once, both callers get the same result", async () => {
    let resolveFn!: (v: typeof okResult) => void;
    const fn = vi.fn(
      () => new Promise<typeof okResult>((resolve) => { resolveFn = resolve; }),
    );

    const p1 = memoizedBootstrap("sandbox-1", fn);
    const p2 = memoizedBootstrap("sandbox-1", fn);
    expect(fn).toHaveBeenCalledTimes(1);

    resolveFn(okResult);
    expect(await p1).toEqual(okResult);
    expect(await p2).toEqual(okResult);
  });

  it("isolates state per sandbox id", async () => {
    const fn = vi.fn(async () => okResult);
    await memoizedBootstrap("sandbox-A", fn);
    await memoizedBootstrap("sandbox-B", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
