import { describe, it, expect } from "vitest";
import * as z from "zod";
import { BaseTool, type ToolRuntime } from "../base.js";

// Reusable test tools
const schemaA = z.object({ path: z.string().describe("File path") });
const schemaB = z.object({ command: z.string() });

class ReadTool extends BaseTool<typeof schemaA> {
  name = "read_file";
  description = "Read a file";
  schema = schemaA;
  protected async _call(): Promise<string> { return "content"; }
}

class BashTool extends BaseTool<typeof schemaB> {
  name = "bash";
  description = "Execute command";
  schema = schemaB;
  protected async _call(): Promise<string> { return "output"; }
}

// Create fresh registry per test (don't use the singleton)
function createRegistry() {
  const tools = new Map<string, BaseTool>();
  return {
    register(tool: BaseTool) { tools.set(tool.name, tool); },
    get(name: string) { return tools.get(name); },
    toToolDefinitions() {
      return [...tools.values()].map((t) => {
        const j = t.toJsonTool();
        return { name: j.name, description: j.description, inputSchema: j.input_schema };
      });
    },
    toPromptSection() {
      return [...tools.values()].map((t) => `- ${t.name}: ${t.description}`).join("\n");
    },
  };
}

describe("ToolRegistry", () => {
  it("registers and retrieves tools", () => {
    const registry = createRegistry();
    registry.register(new ReadTool());
    registry.register(new BashTool());

    expect(registry.get("read_file")).toBeDefined();
    expect(registry.get("bash")).toBeDefined();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("generates tool definitions with JSON Schema", () => {
    const registry = createRegistry();
    registry.register(new ReadTool());
    registry.register(new BashTool());

    const defs = registry.toToolDefinitions();

    expect(defs).toHaveLength(2);
    expect(defs[0]).toMatchObject({
      name: "read_file",
      description: "Read a file",
    });
    expect(defs[0].inputSchema).toMatchObject({
      type: "object",
      properties: { path: { type: "string" } },
    });
  });

  it("generates prompt section", () => {
    const registry = createRegistry();
    registry.register(new ReadTool());
    registry.register(new BashTool());

    const section = registry.toPromptSection();

    expect(section).toContain("- read_file: Read a file");
    expect(section).toContain("- bash: Execute command");
  });

  it("overwrites tool on duplicate register", () => {
    const registry = createRegistry();

    class ReadV1 extends BaseTool<typeof schemaA> {
      name = "read_file";
      description = "v1";
      schema = schemaA;
      protected async _call(): Promise<string> { return "v1"; }
    }

    class ReadV2 extends BaseTool<typeof schemaA> {
      name = "read_file";
      description = "v2";
      schema = schemaA;
      protected async _call(): Promise<string> { return "v2"; }
    }

    registry.register(new ReadV1());
    registry.register(new ReadV2());

    const defs = registry.toToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].description).toBe("v2");
  });
});
