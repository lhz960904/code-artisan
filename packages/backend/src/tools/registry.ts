import type { BaseTool } from "./base.js";

class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /** Generate tools array for LLM API (JSON Schema format). */
  toJsonTools(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    return [...this.tools.values()].map((t) => t.toJsonTool());
  }

  /** Generate tool descriptions for system prompt. */
  toPromptSection(): string {
    return [...this.tools.values()]
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
  }
}

export const toolRegistry = new ToolRegistry();
