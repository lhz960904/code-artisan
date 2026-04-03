import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpTools, type McpServerConfig } from "../mcp-tools.js";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "resolve-library-id",
          description: "Resolve a library ID",
          inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        },
        {
          name: "get-library-docs",
          description: "Get library docs",
          inputSchema: { type: "object", properties: { libraryId: { type: "string" } } },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "tool result content" }],
    }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

describe("McpTools", () => {
  let mcpTools: McpTools;

  beforeEach(() => {
    mcpTools = new McpTools();
  });

  it("initializes and discovers tools from MCP servers", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    const tools = await mcpTools.initialize(configs);

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("mcp_context7_resolve-library-id");
    expect(tools[1].name).toBe("mcp_context7_get-library-docs");
  });

  it("generates correct JSON Schema for discovered tools", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    const tools = await mcpTools.initialize(configs);
    const jsonTool = tools[0].toJsonTool();

    expect(jsonTool.name).toBe("mcp_context7_resolve-library-id");
    expect(jsonTool.description).toContain("context7");
    expect(jsonTool.input_schema).toEqual({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    });
  });

  it("hasTool returns true for registered MCP tools", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    await mcpTools.initialize(configs);
    expect(mcpTools.hasTool("mcp_context7_resolve-library-id")).toBe(true);
    expect(mcpTools.hasTool("bash")).toBe(false);
  });

  it("callTool routes to correct MCP client", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    await mcpTools.initialize(configs);
    const result = await mcpTools.callTool("mcp_context7_resolve-library-id", { query: "react" });

    expect(result).toBe("tool result content");
  });

  it("callTool returns error for unknown tool", async () => {
    await mcpTools.initialize([]);
    const result = await mcpTools.callTool("mcp_unknown_tool", {});
    expect(result).toContain("Error");
    expect(result).toContain("Unknown MCP tool");
  });

  it("cleanup clears tool map", async () => {
    const configs: McpServerConfig[] = [
      { serverId: "context7", command: "npx", args: ["-y", "@upstash/context7-mcp"], envVars: {} },
    ];

    await mcpTools.initialize(configs);
    await mcpTools.cleanup();

    expect(mcpTools.hasTool("mcp_context7_resolve-library-id")).toBe(false);
  });

  it("returns empty array when no servers configured", async () => {
    const tools = await mcpTools.initialize([]);
    expect(tools).toHaveLength(0);
  });
});
