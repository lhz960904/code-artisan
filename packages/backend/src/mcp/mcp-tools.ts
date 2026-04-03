import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpTool } from "./mcp-tool.js";

export interface McpServerConfig {
  serverId: string;
  command: string;
  args: string[];
  envVars: Record<string, string>;
}

export class McpTools {
  private clients = new Map<string, Client>();
  private toolMap = new Map<string, { serverId: string; toolName: string }>();

  async initialize(servers: McpServerConfig[]): Promise<McpTool[]> {
    const allTools: McpTool[] = [];

    for (const server of servers) {
      try {
        const tools = await this.connectServer(server);
        allTools.push(...tools);
      } catch (err) {
        console.error(`[mcp] Failed to connect to ${server.serverId}:`, err);
      }
    }

    return allTools;
  }

  hasTool(name: string): boolean {
    return this.toolMap.has(name);
  }

  async callTool(fullName: string, input: Record<string, unknown>): Promise<string> {
    const routing = this.toolMap.get(fullName);
    if (!routing) {
      return `Error: Unknown MCP tool: ${fullName}`;
    }

    const client = this.clients.get(routing.serverId);
    if (!client) {
      return `Error: MCP server ${routing.serverId} not connected`;
    }

    try {
      const result = await client.callTool({
        name: routing.toolName,
        arguments: input,
      });

      if (!result.content || !Array.isArray(result.content)) {
        return "Tool executed successfully (no output)";
      }

      const textParts: string[] = [];
      for (const item of result.content) {
        if (typeof item === "object" && item !== null && "text" in item) {
          textParts.push(String(item.text));
        } else {
          textParts.push(String(item));
        }
      }

      return textParts.join("\n") || "Tool executed successfully (no output)";
    } catch (err) {
      return `Error calling MCP tool ${fullName}: ${String(err)}`;
    }
  }

  async cleanup(): Promise<void> {
    for (const [serverId, client] of this.clients) {
      try {
        await client.close();
      } catch (err) {
        console.error(`[mcp] Error closing client for ${serverId}:`, err);
      }
    }
    this.clients.clear();
    this.toolMap.clear();
  }

  private async connectServer(config: McpServerConfig): Promise<McpTool[]> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.envVars,
    });

    const client = new Client({ name: "code-artisan", version: "1.0.0" });
    await client.connect(transport);

    this.clients.set(config.serverId, client);

    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools || [];

    const callFn = this.callTool.bind(this);

    return tools.map((tool) => {
      const fullName = `mcp_${config.serverId}_${tool.name}`;
      this.toolMap.set(fullName, { serverId: config.serverId, toolName: tool.name });

      return new McpTool(config.serverId, tool.name, tool.description || tool.name, (tool.inputSchema as Record<string, unknown>) || {}, callFn);
    });
  }
}
