import * as z from "zod";
import { BaseTool, type ToolRuntime } from "../tools/base.js";

type McpCallFn = (fullName: string, input: Record<string, unknown>) => Promise<string>;

export class McpTool extends BaseTool<z.ZodObject<z.ZodRawShape>> {
  name: string;
  description: string;
  schema = z.object({});

  private fullName: string;
  private mcpInputSchema: Record<string, unknown>;
  private callFn: McpCallFn;

  constructor(serverId: string, toolName: string, toolDescription: string, inputSchema: Record<string, unknown>, callFn: McpCallFn) {
    super();
    this.fullName = `mcp_${serverId}_${toolName}`;
    this.name = this.fullName;
    this.description = `[${serverId}] ${toolDescription}`;
    this.mcpInputSchema = inputSchema;
    this.callFn = callFn;
  }

  override toJsonTool() {
    return {
      name: this.fullName,
      description: this.description,
      input_schema: this.mcpInputSchema,
    };
  }

  /** Override call() to skip Zod stripping — MCP input is passed through as-is. */
  override async call(runtime: ToolRuntime, rawInput: unknown): Promise<string> {
    try {
      return await this._call(runtime, rawInput as z.infer<typeof this.schema>);
    } catch (err) {
      return `Error: ${String(err)}`;
    }
  }

  protected async _call(_runtime: ToolRuntime, input: z.infer<typeof this.schema>): Promise<string> {
    return this.callFn(this.fullName, input as Record<string, unknown>);
  }
}
