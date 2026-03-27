import { describe, it, expect, afterEach } from "vitest";
import { SandboxService } from "../../src/services/sandbox.js";

describe("SandboxService", () => {
  let sandbox: SandboxService | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.close();
      sandbox = null;
    }
  });

  it("should create a sandbox and execute a command", async () => {
    sandbox = await SandboxService.create();
    const result = await sandbox.executeCommand("echo hello");
    expect(result.output.trim()).toBe("hello");
    expect(result.error).toBeUndefined();
  }, 30000);

  it("should write and read a file", async () => {
    sandbox = await SandboxService.create();
    await sandbox.writeFile("/tmp/test.txt", "hello world");
    const content = await sandbox.readFile("/tmp/test.txt");
    expect(content).toBe("hello world");
  }, 30000);

  it("should list files in a directory", async () => {
    sandbox = await SandboxService.create();
    await sandbox.writeFile("/tmp/project/main.py", "print('hi')");
    const files = await sandbox.listFiles("/tmp/project");
    expect(files).toContain("main.py");
  }, 30000);
});
