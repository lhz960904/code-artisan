import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModifiedFiles } from "../file-scanner";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "scanner-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("getModifiedFiles", () => {
  it("should return files modified after the given timestamp", async () => {
    await writeFile(join(tempDir, "old.txt"), "old content");

    await new Promise((r) => setTimeout(r, 50));
    const since = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    await writeFile(join(tempDir, "new.txt"), "new content");

    const files = await getModifiedFiles(tempDir, since);

    expect(files.length).toBe(1);
    expect(files[0].path).toContain("new.txt");
    expect(files[0].content).toBe("new content");
  });

  it("should return empty array when no files modified", async () => {
    await writeFile(join(tempDir, "old.txt"), "old");

    await new Promise((r) => setTimeout(r, 50));
    const since = Date.now();

    const files = await getModifiedFiles(tempDir, since);
    expect(files).toEqual([]);
  });

  it("should scan subdirectories recursively", async () => {
    const since = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src", "index.ts"), "export {}");

    const files = await getModifiedFiles(tempDir, since);

    expect(files.length).toBe(1);
    expect(files[0].path).toContain("src/index.ts");
    expect(files[0].content).toBe("export {}");
  });

  it("should exclude node_modules and .git directories", async () => {
    const since = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    await mkdir(join(tempDir, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(tempDir, "node_modules", "pkg", "index.js"), "module.exports = {}");
    await mkdir(join(tempDir, ".git", "objects"), { recursive: true });
    await writeFile(join(tempDir, ".git", "objects", "abc"), "blob");
    await writeFile(join(tempDir, "app.ts"), "console.log('hi')");

    const files = await getModifiedFiles(tempDir, since);

    expect(files.length).toBe(1);
    expect(files[0].path).toContain("app.ts");
  });

  it("should skip binary files gracefully", async () => {
    const since = Date.now();
    await new Promise((r) => setTimeout(r, 50));

    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]);
    await Bun.write(join(tempDir, "image.png"), buf);
    await writeFile(join(tempDir, "text.ts"), "hello");

    const files = await getModifiedFiles(tempDir, since);

    const paths = files.map((f) => f.path);
    expect(paths.some((p) => p.includes("text.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("image.png"))).toBe(false);
  });
});
