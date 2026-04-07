import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { Sandbox } from "../../sandbox/base";
import {
  createBashTool,
  createLsTool,
  createReadFileTool,
  createWriteFileTool,
  createStrReplaceTool,
  createGlobTool,
  createGrepTool,
  createWebSearchTool,
  createWebFetchTool,
} from "./index";

// ---- Mock sandbox ----

function createMockSandbox(): Sandbox {
  return {
    id: "mock-sandbox",
    exec: mock(() => Promise.resolve("")),
    readFile: mock(() => Promise.resolve("")),
    writeFile: mock(() => Promise.resolve(undefined)),
    listDir: mock(() => Promise.resolve([])),
    glob: mock(() => Promise.resolve({ files: [] })),
    grep: mock(() => Promise.resolve({ matches: [] })),
    close: mock(() => Promise.resolve(undefined)),
  } as unknown as Sandbox;
}

// ---- bash ----

describe("createBashTool", () => {
  it("should execute command and return output", async () => {
    const sandbox = createMockSandbox();
    (sandbox.exec as ReturnType<typeof mock>).mockResolvedValue("file1.ts\nfile2.ts");
    const tool = createBashTool(sandbox);

    const result = await tool.invoke({ command: "ls /app" });

    expect(result).toBe("file1.ts\nfile2.ts");
    expect(sandbox.exec).toHaveBeenCalledWith("ls /app");
  });

  it("should return (no output) for empty result", async () => {
    const sandbox = createMockSandbox();
    const tool = createBashTool(sandbox);

    const result = await tool.invoke({ command: "true" });

    expect(result).toBe("(no output)");
  });
});

// ---- ls ----

describe("createLsTool", () => {
  it("should list directory contents", async () => {
    const sandbox = createMockSandbox();
    (sandbox.listDir as ReturnType<typeof mock>).mockResolvedValue(["src/", "package.json", "README.md"]);
    const tool = createLsTool(sandbox);

    const result = await tool.invoke({ path: "/app" });

    expect(result).toBe("src/\npackage.json\nREADME.md");
    expect(sandbox.listDir).toHaveBeenCalledWith("/app");
  });

  it("should return (empty) for empty directory", async () => {
    const sandbox = createMockSandbox();
    const tool = createLsTool(sandbox);

    const result = await tool.invoke({ path: "/empty" });

    expect(result).toBe("(empty)");
  });
});

// ---- read_file ----

describe("createReadFileTool", () => {
  it("should read file contents", async () => {
    const sandbox = createMockSandbox();
    (sandbox.readFile as ReturnType<typeof mock>).mockResolvedValue("hello world");
    const tool = createReadFileTool(sandbox);

    const result = await tool.invoke({ path: "/app/test.txt" });

    expect(result).toBe("hello world");
  });

  it("should return (empty) for empty file", async () => {
    const sandbox = createMockSandbox();
    const tool = createReadFileTool(sandbox);

    const result = await tool.invoke({ path: "/app/empty.txt" });

    expect(result).toBe("(empty)");
  });

  it("should read specific line range", async () => {
    const sandbox = createMockSandbox();
    (sandbox.readFile as ReturnType<typeof mock>).mockResolvedValue("line1\nline2\nline3\nline4\nline5");
    const tool = createReadFileTool(sandbox);

    const result = await tool.invoke({ path: "/app/test.txt", start_line: 2, end_line: 4 });

    expect(result).toBe("line2\nline3\nline4");
  });

  it("should add hint when file is too large", async () => {
    const sandbox = createMockSandbox();
    const longContent = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}: ${"x".repeat(20)}`).join("\n");
    (sandbox.readFile as ReturnType<typeof mock>).mockResolvedValue(longContent);
    const tool = createReadFileTool(sandbox);

    const result = await tool.invoke({ path: "/app/big.txt" });

    expect(result).toContain("characters omitted");
    expect(result).toContain("start_line");
  });
});

// ---- write_file ----

describe("createWriteFileTool", () => {
  it("should write content to file", async () => {
    const sandbox = createMockSandbox();
    const tool = createWriteFileTool(sandbox);

    const result = await tool.invoke({ path: "/app/test.txt", content: "hello" });

    expect(result).toBe("OK");
    expect(sandbox.writeFile).toHaveBeenCalledWith("/app/test.txt", "hello", { append: undefined });
  });

  it("should append when append is true", async () => {
    const sandbox = createMockSandbox();
    const tool = createWriteFileTool(sandbox);

    await tool.invoke({ path: "/app/log.txt", content: "new line", append: true });

    expect(sandbox.writeFile).toHaveBeenCalledWith("/app/log.txt", "new line", { append: true });
  });
});

// ---- str_replace ----

describe("createStrReplaceTool", () => {
  it("should replace first occurrence", async () => {
    const sandbox = createMockSandbox();
    (sandbox.readFile as ReturnType<typeof mock>).mockResolvedValue("foo bar foo");
    const tool = createStrReplaceTool(sandbox);

    const result = await tool.invoke({ path: "/app/test.txt", old_str: "foo", new_str: "baz" });

    expect(result).toBe("OK");
    expect(sandbox.writeFile).toHaveBeenCalledWith("/app/test.txt", "baz bar foo");
  });

  it("should replace all occurrences when replace_all is true", async () => {
    const sandbox = createMockSandbox();
    (sandbox.readFile as ReturnType<typeof mock>).mockResolvedValue("foo bar foo");
    const tool = createStrReplaceTool(sandbox);

    await tool.invoke({ path: "/app/test.txt", old_str: "foo", new_str: "baz", replace_all: true });

    expect(sandbox.writeFile).toHaveBeenCalledWith("/app/test.txt", "baz bar baz");
  });

  it("should return error when substring not found", async () => {
    const sandbox = createMockSandbox();
    (sandbox.readFile as ReturnType<typeof mock>).mockResolvedValue("hello world");
    const tool = createStrReplaceTool(sandbox);

    const result = await tool.invoke({ path: "/app/test.txt", old_str: "notfound", new_str: "x" });

    expect(result).toContain("not found");
  });
});

// ---- glob ----

describe("createGlobTool", () => {
  it("should return matching files", async () => {
    const sandbox = createMockSandbox();
    (sandbox.glob as ReturnType<typeof mock>).mockResolvedValue({
      files: [
        { path: "src/index.ts", is_dir: false },
        { path: "src/utils.ts", is_dir: false },
      ],
    });
    const tool = createGlobTool(sandbox);

    const result = await tool.invoke({ pattern: "**/*.ts", path: "/app" });

    expect(result).toContain("src/index.ts");
    expect(result).toContain("src/utils.ts");
    expect(sandbox.glob).toHaveBeenCalledWith("**/*.ts", "/app");
  });

  it("should return message when no matches", async () => {
    const sandbox = createMockSandbox();
    const tool = createGlobTool(sandbox);

    const result = await tool.invoke({ pattern: "*.py", path: "/app" });

    expect(result).toContain("No matches");
  });
});

// ---- grep ----

describe("createGrepTool", () => {
  it("should return matching lines", async () => {
    const sandbox = createMockSandbox();
    (sandbox.grep as ReturnType<typeof mock>).mockResolvedValue({
      matches: [
        { path: "src/index.ts", line: 5, text: 'import { foo } from "bar"' },
        { path: "src/utils.ts", line: 12, text: "const foo = 42" },
      ],
    });
    const tool = createGrepTool(sandbox);

    const result = await tool.invoke({ pattern: "foo", path: "/app" });

    expect(result).toContain("src/index.ts");
    expect(result).toContain("5");
    expect(sandbox.grep).toHaveBeenCalledWith("foo", "/app", undefined);
  });

  it("should return message when no matches", async () => {
    const sandbox = createMockSandbox();
    const tool = createGrepTool(sandbox);

    const result = await tool.invoke({ pattern: "nonexistent", path: "/app" });

    expect(result).toContain("No matches");
  });
});

// ---- web_search ----

describe("createWebSearchTool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock() as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should search and format results", async () => {
    (globalThis.fetch as ReturnType<typeof mock>).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "Result 1", content: "Snippet 1", url: "https://a.com" },
          { title: "Result 2", content: "Snippet 2", url: "https://b.com" },
        ],
      }),
    } as Response);

    const tool = createWebSearchTool("test-api-key");
    const result = await tool.invoke({ query: "typescript" });

    expect(result).toContain("Result 1");
    expect(result).toContain("https://a.com");
  });

  it("should return message when no results found", async () => {
    (globalThis.fetch as ReturnType<typeof mock>).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const tool = createWebSearchTool("test-api-key");
    const result = await tool.invoke({ query: "nothing" });

    expect(result).toContain("No results found");
  });

  it("should throw on API errors", async () => {
    (globalThis.fetch as ReturnType<typeof mock>).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);

    const tool = createWebSearchTool("test-api-key");
    await expect(tool.invoke({ query: "test" })).rejects.toThrow("429");
  });
});

// ---- web_fetch ----

describe("createWebFetchTool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock() as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should fetch and return page content", async () => {
    (globalThis.fetch as ReturnType<typeof mock>).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", raw_content: "Page content here" }],
      }),
    } as Response);

    const tool = createWebFetchTool("test-api-key");
    const result = await tool.invoke({ url: "https://example.com" });

    expect(result).toContain("Page content here");
  });

  it("should handle empty extraction", async () => {
    (globalThis.fetch as ReturnType<typeof mock>).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);

    const tool = createWebFetchTool("test-api-key");
    const result = await tool.invoke({ url: "https://example.com" });

    expect(result).toContain("Failed to extract");
  });
});
