import { describe, it, expect, mock } from "bun:test";
import * as z from "zod";
import { createAgent } from "../index";
import { defineTool } from "../../tools/tool";
import { LLMProvider } from "../../types/provider";
import { LocalSandbox } from "../../sandbox/local";
import type { Sandbox } from "../../sandbox/types";

const mockProvider = {
  invoke: mock(),
} as unknown as LLMProvider;

function createMockSandbox(): Sandbox {
  return {} as unknown as Sandbox;
}

describe("createAgent", () => {
  it("should pass through options.sandbox to the Agent (e.g. E2B)", () => {
    const sandbox = createMockSandbox();
    const agent = createAgent({
      prompt: "test",
      model: mockProvider,
      skillsDirs: [],
      sandbox,
    });
    expect((agent as any).sandbox).toBe(sandbox);
  });

  it("should use LocalSandbox when sandbox is omitted", () => {
    const agent = createAgent({
      prompt: "test",
      model: mockProvider,
      skillsDirs: [],
    });
    expect((agent as any).sandbox).toBeInstanceOf(LocalSandbox);
  });

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

  it("should seed initMessages into the agent transcript", () => {
    const initMessages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "hi" }] },
      { role: "assistant" as const, content: [{ type: "text" as const, text: "hello" }] },
    ];
    const agent = createAgent({
      prompt: "sys",
      model: mockProvider,
      skillsDirs: [],
      initMessages,
    });
    const internal = (agent as any).messages;
    expect(internal).toEqual(initMessages);
  });
});
