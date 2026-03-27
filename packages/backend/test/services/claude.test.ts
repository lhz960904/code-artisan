import { describe, it, expect } from "vitest";
import { ClaudeService } from "../../src/services/claude.js";

describe("ClaudeService", () => {
  it("should return a text response for a simple question", async () => {
    const claude = new ClaudeService();
    const response = await claude.chat([
      { role: "user", content: "Say hello in exactly one word." },
    ]);

    expect(response.type).toBe("text");
    if (response.type === "text") {
      expect(response.content.toLowerCase()).toContain("hello");
    }
  }, 30000);

  it("should return a tool_use response when appropriate", async () => {
    const claude = new ClaudeService();
    const response = await claude.chat([
      { role: "user", content: "List the files in /tmp directory." },
    ]);

    expect(response.type).toBe("tool_use");
    if (response.type === "tool_use") {
      expect(response.toolName).toBe("list_files");
      expect(response.toolInput).toHaveProperty("path");
    }
  }, 30000);
});
