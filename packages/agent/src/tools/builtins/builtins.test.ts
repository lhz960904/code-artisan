import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Sandbox } from "../../sandboxs/base";
import type { ToolRuntime } from "../types";
import {
  bashTool,
  lsTool,
  readFileTool,
  writeFileTool,
  strReplaceTool,
  globTool,
  grepTool,
  createWebSearchTool,
  createWebFetchTool,
} from "./index";

// ---- Mock sandbox ----

function createMockSandbox(): Sandbox {
  return {
    exec: vi.fn().mockResolvedValue(""),
    readFile: vi.fn().mockResolvedValue(""),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listDir: vi.fn().mockResolvedValue([]),
    glob: vi.fn().mockResolvedValue({ files: [] }),
    grep: vi.fn().mockResolvedValue({ matches: [] }),
  };
}

function createRuntime(sandbox?: Sandbox): ToolRuntime {
  return { sandbox: sandbox ?? createMockSandbox() };
}

// ---- bash ----

describe("bashTool", () => {
  it("should execute command and return output", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.exec).mockResolvedValue("file1.ts\nfile2.ts");

    const result = await bashTool.call(createRuntime(sandbox), {
      command: "ls /app",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("file1.ts\nfile2.ts");
    expect(sandbox.exec).toHaveBeenCalledWith("ls /app");
  });

  it("should return (no output) for empty result", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.exec).mockResolvedValue("");

    const result = await bashTool.call(createRuntime(sandbox), {
      command: "true",
    });

    expect(result.output).toBe("(no output)");
  });

  it("should catch execution errors", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.exec).mockRejectedValue(new Error("command not found"));

    const result = await bashTool.call(createRuntime(sandbox), {
      command: "nonexistent",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("command not found");
  });
});

// ---- ls ----

describe("lsTool", () => {
  it("should list directory contents", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.listDir).mockResolvedValue(["src/", "package.json", "README.md"]);

    const result = await lsTool.call(createRuntime(sandbox), {
      path: "/app",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("src/\npackage.json\nREADME.md");
    expect(sandbox.listDir).toHaveBeenCalledWith("/app");
  });

  it("should return (empty) for empty directory", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.listDir).mockResolvedValue([]);

    const result = await lsTool.call(createRuntime(sandbox), {
      path: "/empty",
    });

    expect(result.output).toBe("(empty)");
  });
});

// ---- read_file ----

describe("readFileTool", () => {
  it("should read file contents", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.readFile).mockResolvedValue("hello world");

    const result = await readFileTool.call(createRuntime(sandbox), {
      path: "/app/test.txt",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello world");
  });

  it("should return (empty) for empty file", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.readFile).mockResolvedValue("");

    const result = await readFileTool.call(createRuntime(sandbox), {
      path: "/app/empty.txt",
    });

    expect(result.output).toBe("(empty)");
  });

  it("should read specific line range", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.readFile).mockResolvedValue("line1\nline2\nline3\nline4\nline5");

    const result = await readFileTool.call(createRuntime(sandbox), {
      path: "/app/test.txt",
      start_line: 2,
      end_line: 4,
    });

    expect(result.output).toBe("line2\nline3\nline4");
  });

  it("should add hint when file is too large", async () => {
    const sandbox = createMockSandbox();
    const longContent = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}: ${"x".repeat(20)}`).join("\n");
    vi.mocked(sandbox.readFile).mockResolvedValue(longContent);

    const result = await readFileTool.call(createRuntime(sandbox), {
      path: "/app/big.txt",
    });

    expect(result.output).toContain("characters omitted");
    expect(result.output).toContain("start_line");
  });
});

// ---- write_file ----

describe("writeFileTool", () => {
  it("should write content to file", async () => {
    const sandbox = createMockSandbox();

    const result = await writeFileTool.call(createRuntime(sandbox), {
      path: "/app/test.txt",
      content: "hello",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("OK");
    expect(sandbox.writeFile).toHaveBeenCalledWith("/app/test.txt", "hello", { append: false });
  });

  it("should append when append is true", async () => {
    const sandbox = createMockSandbox();

    await writeFileTool.call(createRuntime(sandbox), {
      path: "/app/log.txt",
      content: "new line",
      append: true,
    });

    expect(sandbox.writeFile).toHaveBeenCalledWith("/app/log.txt", "new line", { append: true });
  });
});

// ---- str_replace ----

describe("strReplaceTool", () => {
  it("should replace first occurrence", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.readFile).mockResolvedValue("foo bar foo");

    const result = await strReplaceTool.call(createRuntime(sandbox), {
      path: "/app/test.txt",
      old_str: "foo",
      new_str: "baz",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("OK");
    expect(sandbox.writeFile).toHaveBeenCalledWith("/app/test.txt", "baz bar foo");
  });

  it("should replace all occurrences when replace_all is true", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.readFile).mockResolvedValue("foo bar foo");

    await strReplaceTool.call(createRuntime(sandbox), {
      path: "/app/test.txt",
      old_str: "foo",
      new_str: "baz",
      replace_all: true,
    });

    expect(sandbox.writeFile).toHaveBeenCalledWith("/app/test.txt", "baz bar baz");
  });

  it("should return error when substring not found", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.readFile).mockResolvedValue("hello world");

    const result = await strReplaceTool.call(createRuntime(sandbox), {
      path: "/app/test.txt",
      old_str: "notfound",
      new_str: "x",
    });

    expect(result.success).toBe(true); // tool itself didn't error
    expect(result.output).toContain("not found");
  });
});

// ---- glob ----

describe("globTool", () => {
  it("should return matching files", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.glob).mockResolvedValue({
      files: [
        { path: "src/index.ts", is_dir: false },
        { path: "src/utils.ts", is_dir: false },
      ],
    });

    const result = await globTool.call(createRuntime(sandbox), {
      pattern: "**/*.ts",
      path: "/app",
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("src/index.ts");
    expect(result.output).toContain("src/utils.ts");
    expect(sandbox.glob).toHaveBeenCalledWith("**/*.ts", "/app");
  });

  it("should indicate directories", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.glob).mockResolvedValue({
      files: [
        { path: "src", is_dir: true },
        { path: "README.md", is_dir: false },
      ],
    });

    const result = await globTool.call(createRuntime(sandbox), {
      pattern: "*",
      path: "/app",
    });

    expect(result.output).toContain("src/");
    expect(result.output).toContain("README.md");
  });

  it("should return message when no matches", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.glob).mockResolvedValue({ files: [] });

    const result = await globTool.call(createRuntime(sandbox), {
      pattern: "*.py",
      path: "/app",
    });

    expect(result.output).toContain("No matches");
  });

  it("should return error from sandbox", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.glob).mockResolvedValue({
      files: [],
      error: "directory not found",
    });

    const result = await globTool.call(createRuntime(sandbox), {
      pattern: "*",
      path: "/nonexistent",
    });

    expect(result.output).toContain("directory not found");
  });
});

// ---- grep ----

describe("grepTool", () => {
  it("should return matching lines", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.grep).mockResolvedValue({
      matches: [
        { path: "src/index.ts", line: 5, text: 'import { foo } from "bar"' },
        { path: "src/utils.ts", line: 12, text: "const foo = 42" },
      ],
    });

    const result = await grepTool.call(createRuntime(sandbox), {
      pattern: "foo",
      path: "/app",
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("src/index.ts");
    expect(result.output).toContain("5");
    expect(result.output).toContain("src/utils.ts");
    expect(sandbox.grep).toHaveBeenCalledWith("foo", "/app", undefined);
  });

  it("should pass file pattern filter", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.grep).mockResolvedValue({
      matches: [{ path: "test.py", line: 1, text: "hello" }],
    });

    await grepTool.call(createRuntime(sandbox), {
      pattern: "hello",
      path: "/app",
      include: "*.py",
    });

    expect(sandbox.grep).toHaveBeenCalledWith("hello", "/app", "*.py");
  });

  it("should return message when no matches", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.grep).mockResolvedValue({ matches: [] });

    const result = await grepTool.call(createRuntime(sandbox), {
      pattern: "nonexistent",
      path: "/app",
    });

    expect(result.output).toContain("No matches");
  });

  it("should return error from sandbox", async () => {
    const sandbox = createMockSandbox();
    vi.mocked(sandbox.grep).mockResolvedValue({
      matches: [],
      error: "path not found",
    });

    const result = await grepTool.call(createRuntime(sandbox), {
      pattern: "test",
      path: "/nonexistent",
    });

    expect(result.output).toContain("path not found");
  });
});

// ---- web_search ----

describe("createWebSearchTool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should search and format results", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "Result 1", content: "Snippet 1", url: "https://a.com" },
          { title: "Result 2", content: "Snippet 2", url: "https://b.com" },
        ],
      }),
    } as Response);

    const webSearch = createWebSearchTool("test-api-key");
    const result = await webSearch.call(createRuntime(), { query: "typescript" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("Result 1");
    expect(result.output).toContain("https://a.com");
    expect(result.output).toContain("Result 2");
  });

  it("should return message when no results found", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const webSearch = createWebSearchTool("test-api-key");
    const result = await webSearch.call(createRuntime(), { query: "nothing" });

    expect(result.output).toContain("No results found");
  });

  it("should handle API errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);

    const webSearch = createWebSearchTool("test-api-key");
    const result = await webSearch.call(createRuntime(), { query: "test" });

    expect(result.success).toBe(false);
    expect(result.output).toContain("429");
  });
});

// ---- web_fetch ----

describe("createWebFetchTool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should fetch and return page content", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", raw_content: "Page content here" }],
      }),
    } as Response);

    const webFetch = createWebFetchTool("test-api-key");
    const result = await webFetch.call(createRuntime(), { url: "https://example.com" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("Page content here");
  });

  it("should handle empty extraction", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const webFetch = createWebFetchTool("test-api-key");
    const result = await webFetch.call(createRuntime(), { url: "https://example.com" });

    expect(result.output).toContain("Failed to extract");
  });
});
