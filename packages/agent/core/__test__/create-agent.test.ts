import { describe, it, expect, mock } from "bun:test";
import * as z from "zod";
import { createAgent } from "../index";
import { defineTool } from "../../tools/tool";
import { LLMProvider } from "../../types/provider";

const mockProvider = {
  invoke: mock(),
} as unknown as LLMProvider;

describe("createAgent", () => {
  it("should allow user tools to override built-in tools by name", () => {
    const customBash = defineTool({
      name: "bash",
      description: "Custom bash override",
      parameters: z.object({ command: z.string() }),
      invoke: async () => "custom",
    });

    const agent = createAgent({
      prompt: "test",
      model: mockProvider,
      tools: [customBash],
      skillsDirs: [],
    });

    const tools = (agent as any).tools;
    const bashTools = tools.filter((t: any) => t.name === "bash");
    expect(bashTools).toHaveLength(1);
    expect(bashTools[0].description).toBe("Custom bash override");
  });

  it("should keep built-in tools when no user override is provided", () => {
    const agent = createAgent({
      prompt: "test",
      model: mockProvider,
      skillsDirs: [],
    });

    const tools = (agent as any).tools;
    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain("bash");
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("glob");
  });

  it("should include extra user tools alongside built-ins", () => {
    const customTool = defineTool({
      name: "my_custom_tool",
      description: "A brand new tool",
      parameters: z.object({ input: z.string() }),
      invoke: async () => "result",
    });

    const agent = createAgent({
      prompt: "test",
      model: mockProvider,
      tools: [customTool],
      skillsDirs: [],
    });

    const tools = (agent as any).tools;
    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain("my_custom_tool");
    expect(toolNames).toContain("bash");
  });
});
