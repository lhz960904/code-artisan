import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { LocalSandbox } from "./index";

let sandbox: LocalSandbox;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = join(tmpdir(), `sandbox-test-${crypto.randomUUID().slice(0, 8)}`);
  await mkdir(tmpDir, { recursive: true });
  sandbox = new LocalSandbox({ cwd: tmpDir });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("LocalSandbox", () => {
  it("should have a unique id", () => {
    expect(sandbox.id).toBeTruthy();
    expect(typeof sandbox.id).toBe("string");
  });

  // --- exec ---

  describe("exec", () => {
    it("should execute a command and return output", async () => {
      const output = await sandbox.exec("echo hello");
      expect(output.trim()).toBe("hello");
    });

    it("should throw on command failure", async () => {
      await expect(
        sandbox.exec("ls /nonexistent_path_12345"),
      ).rejects.toThrow();
    });
  });

  // --- readFile / writeFile ---

  describe("readFile / writeFile", () => {
    it("should write and read a file", async () => {
      const filePath = join(tmpDir, "test.txt");
      await sandbox.writeFile(filePath, "hello world");
      const content = await sandbox.readFile(filePath);
      expect(content).toBe("hello world");
    });

    it("should create parent directories", async () => {
      const filePath = join(tmpDir, "deep", "nested", "file.txt");
      await sandbox.writeFile(filePath, "nested content");
      const content = await sandbox.readFile(filePath);
      expect(content).toBe("nested content");
    });

    it("should append to file", async () => {
      const filePath = join(tmpDir, "append.txt");
      await sandbox.writeFile(filePath, "line1");
      await sandbox.writeFile(filePath, "\nline2", { append: true });
      const content = await sandbox.readFile(filePath);
      expect(content).toBe("line1\nline2");
    });
  });

  // --- listDir ---

  describe("listDir", () => {
    it("should list directory contents", async () => {
      const dir = join(tmpDir, "listdir-test");
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "a.txt"), "a");
      await Bun.write(join(dir, "b.txt"), "b");

      const entries = await sandbox.listDir(dir);
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries.some((e) => e.includes("a.txt"))).toBe(true);
      expect(entries.some((e) => e.includes("b.txt"))).toBe(true);
    });
  });

  // --- glob ---

  describe("glob", () => {
    it("should find files matching pattern", async () => {
      const dir = join(tmpDir, "glob-test");
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "file1.ts"), "ts");
      await Bun.write(join(dir, "file2.ts"), "ts");
      await Bun.write(join(dir, "file3.py"), "py");

      const result = await sandbox.glob("*.ts", dir);
      expect(result.error).toBeUndefined();
      expect(result.files.length).toBe(2);
      expect(result.files.every((f) => f.path.endsWith(".ts"))).toBe(true);
    });

    it("should return empty for no matches", async () => {
      const dir = join(tmpDir, "glob-empty");
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "file.txt"), "txt");

      const result = await sandbox.glob("*.rs", dir);
      expect(result.files).toEqual([]);
    });
  });

  // --- grep ---

  describe("grep", () => {
    it("should find text matches across files", async () => {
      const dir = join(tmpDir, "grep-test");
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "a.txt"), "hello world\ngoodbye");
      await Bun.write(join(dir, "b.txt"), "hello there");

      const result = await sandbox.grep("hello", dir);
      expect(result.error).toBeUndefined();
      expect(result.matches.length).toBe(2);
      expect(result.matches.every((m) => m.text.includes("hello"))).toBe(true);
      expect(result.matches.every((m) => m.line >= 1)).toBe(true);
    });

    it("should filter by include pattern", async () => {
      const dir = join(tmpDir, "grep-include");
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "code.ts"), "const foo = 1");
      await Bun.write(join(dir, "code.py"), "foo = 1");

      const result = await sandbox.grep("foo", dir, "*.ts");
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].path).toContain(".ts");
    });

    it("should return empty for no matches", async () => {
      const dir = join(tmpDir, "grep-nomatch");
      await mkdir(dir, { recursive: true });
      await Bun.write(join(dir, "file.txt"), "hello");

      const result = await sandbox.grep("nonexistent", dir);
      expect(result.matches).toEqual([]);
    });
  });

  // --- close ---

  describe("close", () => {
    it("should resolve without error", async () => {
      const s = new LocalSandbox();
      await s.close(); // should not throw
    });
  });
});
