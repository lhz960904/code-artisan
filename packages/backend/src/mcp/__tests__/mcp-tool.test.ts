import { describe, it, expect, vi } from "vitest";
import { McpTool } from "../mcp-tool.js";
import type { ToolRuntime } from "../../tools/base.js";

const mockRuntime: ToolRuntime = {
  sandbox: {} as ToolRuntime["sandbox"],
  conversationId: "test",
};

describe("McpTool", () => {
  it("has correct name with mcp_ prefix", () => {
    const callFn = vi.fn().mockResolvedValue("result");
    const tool = new McpTool(
      "context7",
      "resolve-library-id",
      "Resolve a library ID",
      { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      callFn,
    );
    expect(tool.name).toBe("mcp_context7_resolve-library-id");
  });

  it("returns correct JSON Schema via toJsonTool() without Zod", () => {
    const inputSchema = {
      type: "object",
      properties: {
        libraryName: { type: "string", description: "Library name" },
      },
      required: ["libraryName"],
    };
    const callFn = vi.fn();
    const tool = new McpTool("context7", "resolve-library-id", "Resolve lib", inputSchema, callFn);

    const jsonTool = tool.toJsonTool();
    expect(jsonTool.name).toBe("mcp_context7_resolve-library-id");
    expect(jsonTool.description).toBe("[context7] Resolve lib");
    expect(jsonTool.input_schema).toBe(inputSchema);
  });

  it("delegates _call to the provided callFn", async () => {
    const callFn = vi.fn().mockResolvedValue("tool output text");
    const tool = new McpTool("context7", "query-docs", "Query docs", {}, callFn);

    const result = await tool.call(mockRuntime, { query: "react hooks" });
    expect(result).toBe("tool output text");
    expect(callFn).toHaveBeenCalledWith("mcp_context7_query-docs", { query: "react hooks" });
  });

  it("returns error string when callFn throws", async () => {
    const callFn = vi.fn().mockRejectedValue(new Error("MCP server crashed"));
    const tool = new McpTool("srv", "tool1", "desc", {}, callFn);

    const result = await tool.call(mockRuntime, {});
    expect(result).toContain("Error");
    expect(result).toContain("MCP server crashed");
  });
});
