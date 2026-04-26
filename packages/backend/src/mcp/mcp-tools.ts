import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { convertJsonSchemaToZod } from "zod-from-json-schema";
import * as z from "zod";
import { defineTool, type FunctionTool } from "@code-artisan/agent";

const MCP_CONNECT_TIMEOUT_MS = 10_000;

export interface McpServerConfig {
  serverId: string;
  command: string;
  args: string[];
  envVars: Record<string, string>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`MCP "${label}" init timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Connects to a set of MCP servers over stdio, lists their tools, and
 * wraps each as an agent-package FunctionTool (ready to pass into
 * `createAgent({ tools })`).
 *
 * Returns a handle with `close()` for caller-managed lifecycle — the
 * caller (runner) decides when to tear down the stdio connections.
 */
export class McpToolSet {
  private clients = new Map<string, Client>();
  private toolMap = new Map<
    string,
    { serverId: string; toolName: string }
  >();

  async initialize(servers: McpServerConfig[]): Promise<FunctionTool[]> {
    if (servers.length === 0) return [];
    const settled = await Promise.allSettled(
      servers.map((server) =>
        withTimeout(this.connectServer(server), MCP_CONNECT_TIMEOUT_MS, server.serverId),
      ),
    );
    const all: FunctionTool[] = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === "fulfilled") {
        all.push(...result.value);
      } else {
        console.error(`[mcp] failed to connect ${servers[i].serverId}:`, result.reason);
      }
    }
    return all;
  }

  async close(): Promise<void> {
    for (const [serverId, client] of this.clients) {
      try {
        await client.close();
      } catch (err) {
        console.error(`[mcp] close ${serverId} error:`, err);
      }
    }
    this.clients.clear();
    this.toolMap.clear();
  }

  private async callMcpTool(
    fullName: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    const routing = this.toolMap.get(fullName);
    if (!routing) return `Error: unknown MCP tool: ${fullName}`;
    const client = this.clients.get(routing.serverId);
    if (!client) return `Error: MCP server ${routing.serverId} not connected`;

    try {
      const result = await client.callTool({
        name: routing.toolName,
        arguments: input,
      });
      if (!result.content || !Array.isArray(result.content)) {
        return "Tool executed successfully (no output)";
      }
      const parts: string[] = [];
      for (const item of result.content) {
        if (typeof item === "object" && item !== null && "text" in item) {
          parts.push(String((item as { text: unknown }).text));
        } else {
          parts.push(String(item));
        }
      }
      return parts.join("\n") || "Tool executed successfully (no output)";
    } catch (err) {
      return `Error calling MCP tool ${fullName}: ${String(err)}`;
    }
  }

  private async connectServer(config: McpServerConfig): Promise<FunctionTool[]> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.envVars,
    });

    const client = new Client({ name: "code-artisan", version: "1.0.0" });
    await client.connect(transport);
    this.clients.set(config.serverId, client);

    const { tools } = await client.listTools();

    return (tools ?? []).map((tool) => {
      const fullName = `mcp_${config.serverId}_${tool.name}`;
      this.toolMap.set(fullName, {
        serverId: config.serverId,
        toolName: tool.name,
      });

      const parameters = toZodObject(tool.inputSchema);
      const callMcpTool = this.callMcpTool.bind(this);

      return defineTool({
        name: fullName,
        description: `[${config.serverId}] ${tool.description ?? tool.name}`,
        parameters,
        invoke: async (input) =>
          callMcpTool(fullName, input as Record<string, unknown>),
      }) as FunctionTool;
    });
  }
}

/**
 * MCP tools declare their input with JSON Schema. Agent's `defineTool`
 * expects a Zod object schema (so AnthropicProvider can emit JSON
 * Schema back via `z.toJSONSchema`). Convert once at tool load time.
 *
 * If conversion fails (unsupported schema feature), fall back to a
 * permissive object that accepts any keys — the MCP server will
 * validate the real input on call.
 */
function toZodObject(jsonSchema: unknown): z.ZodObject<Record<string, z.ZodTypeAny>> {
  try {
    const converted = convertJsonSchemaToZod(jsonSchema as Record<string, unknown>);
    if (converted instanceof z.ZodObject) {
      return converted as z.ZodObject<Record<string, z.ZodTypeAny>>;
    }
    // If the top-level schema isn't an object (rare for MCP), wrap.
    return z.object({});
  } catch {
    return z.object({});
  }
}
