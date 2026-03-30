import { describe, it, expect, vi } from "vitest";
import * as z from "zod";
import { BaseTool, truncateOutput, type ToolRuntime } from "../base.js";

// Concrete test tool
class EchoTool extends BaseTool<typeof echoSchema> {
  name = "echo";
  description = "Echoes input text";
  schema = echoSchema;

  protected async _call(_runtime: ToolRuntime, input: z.infer<typeof echoSchema>): Promise<string> {
    return `echo: ${input.text}`;
  }
}

const echoSchema = z.object({
  text: z.string().describe("Text to echo"),
});

class FailingTool extends BaseTool<typeof echoSchema> {
  name = "fail";
  description = "Always throws";
  schema = echoSchema;

  protected async _call(): Promise<string> {
    throw new Error("intentional failure");
  }
}

const mockRuntime: ToolRuntime = {
  sandbox: {} as ToolRuntime["sandbox"],
  conversationId: "test",
};

describe("BaseTool", () => {
  it("executes _call with validated input", async () => {
    const tool = new EchoTool();
    const result = await tool.call(mockRuntime, { text: "hello" });
    expect(result).toBe("echo: hello");
  });

  it("returns error for invalid input", async () => {
    const tool = new EchoTool();
    const result = await tool.call(mockRuntime, { text: 123 });
    expect(result).toContain("Error: Invalid input");
  });

  it("returns error for missing required field", async () => {
    const tool = new EchoTool();
    const result = await tool.call(mockRuntime, {});
    expect(result).toContain("Error: Invalid input");
  });

  it("catches _call exceptions and returns error string", async () => {
    const tool = new FailingTool();
    const result = await tool.call(mockRuntime, { text: "test" });
    expect(result).toContain("Error:");
    expect(result).toContain("intentional failure");
  });

  it("generates correct JSON Schema via toJsonTool", async () => {
    const tool = new EchoTool();
    const jsonTool = tool.toJsonTool();

    expect(jsonTool.name).toBe("echo");
    expect(jsonTool.description).toBe("Echoes input text");
    expect(jsonTool.input_schema).toMatchObject({
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    });
  });

  it("preserves field descriptions in JSON Schema", async () => {
    const tool = new EchoTool();
    const jsonTool = tool.toJsonTool();
    const props = jsonTool.input_schema.properties as Record<string, { description?: string }>;
    expect(props.text.description).toBe("Text to echo");
  });

  it("handles optional and default fields in schema", async () => {
    const schema = z.object({
      path: z.string(),
      append: z.boolean().optional().default(false),
    });

    class OptTool extends BaseTool<typeof schema> {
      name = "opt";
      description = "test";
      schema = schema;
      protected async _call(_r: ToolRuntime, input: z.infer<typeof schema>): Promise<string> {
        return input.append ? "append" : "overwrite";
      }
    }

    const tool = new OptTool();

    // Without optional field — should use default
    const result = await tool.call(mockRuntime, { path: "/tmp/a" });
    expect(result).toBe("overwrite");

    // With optional field
    const result2 = await tool.call(mockRuntime, { path: "/tmp/a", append: true });
    expect(result2).toBe("append");

    // JSON Schema should have both properties
    const jsonTool = tool.toJsonTool();
    const props = Object.keys(jsonTool.input_schema.properties as object);
    expect(props).toContain("path");
    expect(props).toContain("append");
  });

});

describe("truncateOutput", () => {
  it("returns original when under limit", () => {
    const text = "hello world";
    expect(truncateOutput(text)).toBe(text);
  });

  it("truncates with head + tail", () => {
    const text = "A".repeat(5000) + "B".repeat(10000) + "C".repeat(5000);
    const result = truncateOutput(text);
    expect(result).toContain("AAAA");
    expect(result).toContain("CCCC");
    expect(result).toContain("characters omitted");
    expect(result).toContain("20000 total");
    expect(result.length).toBeLessThan(text.length);
  });

  it("respects custom maxChars", () => {
    const text = "x".repeat(200);
    const result = truncateOutput(text, 100);
    expect(result.length).toBeLessThan(200);
    expect(result).toContain("omitted");
  });
});
