import { describe, it, expect, beforeEach, afterEach, mock, type Mock } from "bun:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashTool, lsTool, readFileTool, writeFileTool, strReplaceTool, globTool, grepTool, webSearchTool, webFetchTool } from "../index";
import { MAX_GLOB_RESULTS } from "../builtins/glob";
import type { ToolContext } from "../tool";
import { LocalSandbox } from "../../sandbox/local";

let tempDir: string;
const ctx: ToolContext = { sandbox: new LocalSandbox() };

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agent-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---- bash ----

describe("bashTool", () => {
  it("should execute command and return output", async () => {
    const result = await bashTool.invoke({ description: "test", command: "echo hello" }, ctx);
    expect(result).toBe("hello");
  });

  it("should return (no output) for empty result", async () => {
    const result = await bashTool.invoke({ description: "test", command: "true" }, ctx);
    expect(result).toBe("(no output)");
  });

  it("should spawn a detached process when run_in_background is true", async () => {
    const result = await bashTool.invoke(
      { description: "test", command: "sleep 0.05 && echo done", run_in_background: true },
      ctx,
    );
    expect(result).toMatch(/^Started in background\. PID: \d+\./);
  });
});

// ---- LocalSandbox.spawn ----

describe("LocalSandbox.spawn", () => {
  it("should stream stdout chunks and resolve wait() with exit code", async () => {
    const sandbox = new LocalSandbox();
    const handle = await sandbox.spawn("printf 'line1\\nline2\\n'");

    let stdout = "";
    for await (const chunk of handle.stdout) stdout += chunk;

    const exitCode = await handle.wait();
    expect(stdout).toBe("line1\nline2\n");
    expect(exitCode).toBe(0);
  });

  it("should surface stderr separately", async () => {
    const sandbox = new LocalSandbox();
    const handle = await sandbox.spawn("printf 'oops\\n' 1>&2");

    let stderr = "";
    for await (const chunk of handle.stderr) stderr += chunk;

    await handle.wait();
    expect(stderr).toBe("oops\n");
  });

  it("should report non-zero exit code via wait()", async () => {
    const sandbox = new LocalSandbox();
    const handle = await sandbox.spawn("exit 7");
    const exitCode = await handle.wait();
    expect(exitCode).toBe(7);
  });

  it("should throw from exposePort (local sandbox has no public URL)", async () => {
    const sandbox = new LocalSandbox();
    const handle = await sandbox.spawn("sleep 0.05");
    await expect(handle.exposePort(3000)).rejects.toThrow(/exposePort/);
    await handle.kill();
  });
});

// ---- ls ----

describe("lsTool", () => {
  it("should list directory contents", async () => {
    await mkdir(join(tempDir, "src"));
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "README.md"), "# hi");

    const result = await lsTool.invoke({ description: "test", path: tempDir }, ctx);

    expect(result).toContain("src/");
    expect(result).toContain("package.json");
    expect(result).toContain("README.md");
  });

  it("should return (empty) for empty directory", async () => {
    const emptyDir = join(tempDir, "empty");
    await mkdir(emptyDir);

    const result = await lsTool.invoke({ description: "test", path: emptyDir }, ctx);
    expect(result).toBe("(empty)");
  });
});

// ---- read_file ----

describe("readFileTool", () => {
  it("should read file contents", async () => {
    const filePath = join(tempDir, "test.txt");
    await writeFile(filePath, "hello world");

    const result = await readFileTool.invoke({ description: "test", path: filePath }, ctx);
    expect(result).toBe("hello world");
  });

  it("should return (empty) for empty file", async () => {
    const filePath = join(tempDir, "empty.txt");
    await writeFile(filePath, "");

    const result = await readFileTool.invoke({ description: "test", path: filePath }, ctx);
    expect(result).toBe("(empty)");
  });

  it("should read specific line range", async () => {
    const filePath = join(tempDir, "lines.txt");
    await writeFile(filePath, "line1\nline2\nline3\nline4\nline5");

    const result = await readFileTool.invoke({ description: "test", path: filePath, start_line: 2, end_line: 4 }, ctx);
    expect(result).toBe("line2\nline3\nline4");
  });

  it("should add hint when file is too large", async () => {
    const filePath = join(tempDir, "big.txt");
    const longContent = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}: ${"x".repeat(20)}`).join("\n");
    await writeFile(filePath, longContent);

    const result = await readFileTool.invoke({ description: "test", path: filePath }, ctx);
    expect(result).toContain("characters omitted");
    expect(result).toContain("start_line");
  });
});

// ---- write_file ----

describe("writeFileTool", () => {
  it("should write content to file", async () => {
    const filePath = join(tempDir, "test.txt");

    const result = await writeFileTool.invoke({ description: "test", path: filePath, content: "hello" }, ctx);
    expect(result).toBe("OK");

    const content = await Bun.file(filePath).text();
    expect(content).toBe("hello");
  });

  it("should append when append is true", async () => {
    const filePath = join(tempDir, "log.txt");
    await writeFile(filePath, "first\n");

    await writeFileTool.invoke({ description: "test", path: filePath, content: "second", append: true }, ctx);

    const content = await Bun.file(filePath).text();
    expect(content).toBe("first\nsecond");
  });

  it("should create directories as needed", async () => {
    const filePath = join(tempDir, "deep", "nested", "file.txt");

    await writeFileTool.invoke({ description: "test", path: filePath, content: "deep" }, ctx);

    const content = await Bun.file(filePath).text();
    expect(content).toBe("deep");
  });
});

// ---- str_replace ----

describe("strReplaceTool", () => {
  it("should replace first occurrence", async () => {
    const filePath = join(tempDir, "test.txt");
    await writeFile(filePath, "foo bar foo");

    const result = await strReplaceTool.invoke({ description: "test", path: filePath, old_str: "foo", new_str: "baz" }, ctx);
    expect(result).toBe("OK");

    const content = await Bun.file(filePath).text();
    expect(content).toBe("baz bar foo");
  });

  it("should replace all occurrences when replace_all is true", async () => {
    const filePath = join(tempDir, "test.txt");
    await writeFile(filePath, "foo bar foo");

    await strReplaceTool.invoke({ description: "test", path: filePath, old_str: "foo", new_str: "baz", replace_all: true }, ctx);

    const content = await Bun.file(filePath).text();
    expect(content).toBe("baz bar baz");
  });

  it("should return error when substring not found", async () => {
    const filePath = join(tempDir, "test.txt");
    await writeFile(filePath, "hello world");

    const result = await strReplaceTool.invoke({ description: "test", path: filePath, old_str: "notfound", new_str: "x" }, ctx);
    expect(result).toContain("not found");
  });
});

// ---- glob ----

describe("globTool", () => {
  it("should return matching files", async () => {
    await mkdir(join(tempDir, "src"));
    await writeFile(join(tempDir, "src", "index.ts"), "");
    await writeFile(join(tempDir, "src", "utils.ts"), "");

    const result = await globTool.invoke({ description: "test", pattern: "**/*.ts", path: tempDir }, ctx);

    expect(result).toContain("src/index.ts");
    expect(result).toContain("src/utils.ts");
  });

  it("should return message when no matches", async () => {
    const result = await globTool.invoke({ description: "test", pattern: "*.py", path: tempDir }, ctx);
    expect(result).toContain("No matches");
  });

  it("should warn when results are truncated", async () => {
    const dir = join(tempDir, "many");
    await mkdir(dir);
    const writes = Array.from({ length: MAX_GLOB_RESULTS + 10 }, (_, i) => writeFile(join(dir, `file${i}.txt`), ""));
    await Promise.all(writes);

    const result = await globTool.invoke({ description: "test", pattern: "**/*.txt", path: dir }, ctx);

    expect(result).toContain(`Found ${MAX_GLOB_RESULTS} matches`);
    expect(result).toContain("truncated");
    expect(result).toContain("more specific pattern");
  });
});

// ---- grep ----

describe("grepTool", () => {
  it("should return matching lines", async () => {
    await mkdir(join(tempDir, "src"));
    await writeFile(join(tempDir, "src", "index.ts"), 'import { foo } from "bar"\nconst x = 1');
    await writeFile(join(tempDir, "src", "utils.ts"), "const foo = 42\nconst y = 2");

    const result = await grepTool.invoke({ description: "test", pattern: "foo", path: tempDir }, ctx);

    expect(result).toContain("index.ts");
    expect(result).toContain("utils.ts");
    expect(result).toContain("foo");
  });

  it("should return message when no matches", async () => {
    await writeFile(join(tempDir, "test.txt"), "hello");

    const result = await grepTool.invoke({ description: "test", pattern: "nonexistent", path: tempDir }, ctx);
    expect(result).toContain("No matches");
  });
});

// ---- web_search ----

describe("webSearchTool", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    globalThis.fetch = mock() as any;
    process.env.TAVILY_API_KEY = "test-api-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      process.env.TAVILY_API_KEY = originalEnv;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  });

  it("should search and format results", async () => {
    (globalThis.fetch as unknown as Mock<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "Result 1", content: "Snippet 1", url: "https://a.com" },
          { title: "Result 2", content: "Snippet 2", url: "https://b.com" },
        ],
      }),
    } as Response);

    const result = await webSearchTool.invoke({ description: "test", query: "typescript" }, ctx);

    expect(result).toContain("Result 1");
    expect(result).toContain("https://a.com");
  });

  it("should return message when no results found", async () => {
    (globalThis.fetch as unknown as Mock<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const result = await webSearchTool.invoke({ description: "test", query: "nothing" }, ctx);

    expect(result).toContain("No results found");
  });

  it("should throw on API errors", async () => {
    (globalThis.fetch as unknown as Mock<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);

    await expect(webSearchTool.invoke({ description: "test", query: "test" }, ctx)).rejects.toThrow("429");
  });
});

// ---- web_fetch ----

describe("webFetchTool", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    globalThis.fetch = mock() as any;
    process.env.TAVILY_API_KEY = "test-api-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      process.env.TAVILY_API_KEY = originalEnv;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  });

  it("should fetch and return page content", async () => {
    (globalThis.fetch as unknown as Mock<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", raw_content: "Page content here" }],
      }),
    } as Response);

    const result = await webFetchTool.invoke({ description: "test", url: "https://example.com" }, ctx);

    expect(result).toContain("Page content here");
  });

  it("should handle empty extraction", async () => {
    (globalThis.fetch as unknown as Mock<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const result = await webFetchTool.invoke({ description: "test", url: "https://example.com" }, ctx);

    expect(result).toContain("Failed to extract");
  });
});
