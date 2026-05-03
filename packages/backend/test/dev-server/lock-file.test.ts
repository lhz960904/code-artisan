import { describe, it, expect, vi } from "vitest";
import {
  LOCK_FILE_PATH,
  readLockFile,
  writeLockFile,
  clearLockFile,
} from "../../src/services/dev-server/lock-file";
import type { E2BSandbox } from "../../src/sandbox/e2b-sandbox";

function makeFakeSandbox(opts: {
  read?: (path: string) => Promise<string>;
  write?: (path: string, content: string) => Promise<void>;
  makeDir?: (path: string) => Promise<boolean>;
  remove?: (path: string) => Promise<void>;
}): E2BSandbox {
  return {
    readFile: opts.read ?? vi.fn(async () => { throw new Error("nope"); }),
    writeFile: opts.write ?? vi.fn(async () => {}),
    sdk: {
      files: {
        makeDir: opts.makeDir ?? vi.fn(async () => true),
        remove: opts.remove ?? vi.fn(async () => {}),
      },
    },
  } as unknown as E2BSandbox;
}

describe("readLockFile", () => {
  it("returns null when file is missing", async () => {
    const sandbox = makeFakeSandbox({ read: async () => { throw new Error("ENOENT"); } });
    expect(await readLockFile(sandbox)).toBeNull();
  });

  it("returns null on JSON parse failure", async () => {
    const sandbox = makeFakeSandbox({ read: async () => "not-json{{{" });
    expect(await readLockFile(sandbox)).toBeNull();
  });

  it("returns null on schema validation failure", async () => {
    const sandbox = makeFakeSandbox({ read: async () => JSON.stringify({ port: -1 }) });
    expect(await readLockFile(sandbox)).toBeNull();
  });

  it("returns parsed lock for valid file", async () => {
    const lock = { port: 5173, sessionId: "abc", command: "pnpm dev", ts: 1700000000000 };
    const sandbox = makeFakeSandbox({ read: async () => JSON.stringify(lock) });
    expect(await readLockFile(sandbox)).toEqual(lock);
  });
});

describe("writeLockFile", () => {
  it("makes the parent dir then writes JSON to LOCK_FILE_PATH", async () => {
    const writeSpy = vi.fn(async () => {});
    const makeDirSpy = vi.fn(async () => true);
    const sandbox = makeFakeSandbox({ write: writeSpy, makeDir: makeDirSpy });
    const lock = { port: 5173, sessionId: "abc", command: "pnpm dev", ts: 1 };

    await writeLockFile(sandbox, lock);

    expect(makeDirSpy).toHaveBeenCalledOnce();
    expect(writeSpy).toHaveBeenCalledWith(LOCK_FILE_PATH, expect.stringContaining('"port": 5173'));
  });

  it("still writes when makeDir throws (dir already exists)", async () => {
    const writeSpy = vi.fn(async () => {});
    const sandbox = makeFakeSandbox({
      write: writeSpy,
      makeDir: async () => { throw new Error("EEXIST"); },
    });
    await writeLockFile(sandbox, { port: 5173, sessionId: "x", command: "y", ts: 1 });
    expect(writeSpy).toHaveBeenCalledOnce();
  });
});

describe("clearLockFile", () => {
  it("calls remove on the lock path", async () => {
    const removeSpy = vi.fn(async () => {});
    const sandbox = makeFakeSandbox({ remove: removeSpy });
    await clearLockFile(sandbox);
    expect(removeSpy).toHaveBeenCalledWith(LOCK_FILE_PATH);
  });

  it("swallows errors when file does not exist", async () => {
    const sandbox = makeFakeSandbox({ remove: async () => { throw new Error("ENOENT"); } });
    await expect(clearLockFile(sandbox)).resolves.toBeUndefined();
  });
});
