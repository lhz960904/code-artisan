import type { BaseTool } from "./base.js";
import type { ToolDefinition } from "../agent/types.js";

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /** Provider-agnostic tool definitions (JSON Schema). */
  toToolDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => {
      const jsonTool = t.toJsonTool();
      return {
        name: jsonTool.name,
        description: jsonTool.description,
        inputSchema: jsonTool.input_schema,
      };
    });
  }

  /** Generate tool descriptions for system prompt. */
  toPromptSection(): string {
    return [...this.tools.values()]
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
  }
}

