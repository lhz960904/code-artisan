import { describe, it, expect, vi } from "vitest";
import * as z from "zod";
import { tool } from "./tool";
import type { ToolRuntime } from "./types";

const mockRuntime: ToolRuntime = {
  sandbox: {} as ToolRuntime["sandbox"],
};

describe("tool()", () => {
  // --- definition ---

  describe("definition", () => {
    it("should return a tool with name, description, and parameters", () => {
      const t = tool({
        name: "greet",
        description: "Say hello",
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }) => `Hello, ${name}!`,
      });

      expect(t.name).toBe("greet");
      expect(t.description).toBe("Say hello");
      expect(t.parameters).toBeDefined();
    });

    it("should allow tool without execute (schema-only)", () => {
      const t = tool({
        name: "manual_tool",
        description: "No auto-execute",
        parameters: z.object({ x: z.number() }),
      });

      expect(t.name).toBe("manual_tool");
      expect(t.execute).toBeUndefined();
    });
  });

  // --- toToolDefinition ---

  describe("toToolDefinition()", () => {
    it("should convert to provider-agnostic Tool format", () => {
      const t = tool({
        name: "search",
        description: "Search the web",
        parameters: z.object({
          query: z.string(),
          limit: z.number().optional(),
        }),
        execute: async () => "results",
      });

      const def = t.toToolDefinition();

      expect(def.type).toBe("function");
      expect(def.function.name).toBe("search");
      expect(def.function.description).toBe("Search the web");
      expect(def.function.parameters).toHaveProperty("type", "object");
      expect(def.function.parameters).toHaveProperty("properties.query");
      expect(def.function.parameters).toHaveProperty("properties.limit");
    });

    it("should produce valid JSON Schema from Zod schema", () => {
      const t = tool({
        name: "test",
        description: "test",
        parameters: z.object({
          required_field: z.string(),
          optional_field: z.number().optional(),
        }),
        execute: async () => "ok",
      });

      const schema = t.toToolDefinition().function.parameters;
      expect(schema.required).toContain("required_field");
      expect(schema.required).not.toContain("optional_field");
    });
  });

  // --- call ---

  describe("call()", () => {
    it("should validate input and execute", async () => {
      const executeFn = vi.fn().mockResolvedValue("done");
      const t = tool({
        name: "test",
        description: "test",
        parameters: z.object({ value: z.string() }),
        execute: executeFn,
      });

      const result = await t.call(mockRuntime, { value: "hello" });

      expect(result.success).toBe(true);
      expect(result.output).toBe("done");
      expect(executeFn).toHaveBeenCalledWith(
        { value: "hello" },
        mockRuntime,
      );
    });

    it("should return validation error for invalid input", async () => {
      const t = tool({
        name: "test",
        description: "test",
        parameters: z.object({ count: z.number() }),
        execute: async () => "ok",
      });

      const result = await t.call(mockRuntime, { count: "not-a-number" });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Validation error");
    });

    it("should return error when execute throws", async () => {
      const t = tool({
        name: "risky",
        description: "might fail",
        parameters: z.object({}),
        execute: async () => {
          throw new Error("sandbox crashed");
        },
      });

      const result = await t.call(mockRuntime, {});

      expect(result.success).toBe(false);
      expect(result.output).toContain("sandbox crashed");
    });

    it("should catch non-Error throws", async () => {
      const t = tool({
        name: "weird",
        description: "throws string",
        parameters: z.object({}),
        execute: async () => {
          throw "string error";
        },
      });

      const result = await t.call(mockRuntime, {});

      expect(result.success).toBe(false);
      expect(result.output).toContain("string error");
    });

    it("should throw if tool has no execute", async () => {
      const t = tool({
        name: "no_exec",
        description: "schema only",
        parameters: z.object({}),
      });

      const result = await t.call(mockRuntime, {});

      expect(result.success).toBe(false);
      expect(result.output).toContain("no execute");
    });

    it("should strip extra fields from input", async () => {
      const executeFn = vi.fn().mockResolvedValue("ok");
      const t = tool({
        name: "strict",
        description: "test",
        parameters: z.object({ keep: z.string() }),
        execute: executeFn,
      });

      await t.call(mockRuntime, { keep: "yes", extra: "should be removed" });

      expect(executeFn).toHaveBeenCalledWith(
        { keep: "yes" },
        mockRuntime,
      );
    });
  });

  // --- truncation ---

  describe("output truncation", () => {
    it("should not truncate by default", async () => {
      const longOutput = "x".repeat(20000);
      const t = tool({
        name: "verbose",
        description: "returns a lot",
        parameters: z.object({}),
        execute: async () => longOutput,
      });

      const result = await t.call(mockRuntime, {});

      expect(result.success).toBe(true);
      expect(result.output).toBe(longOutput);
    });

    it("should truncate when maxOutputChars is set", async () => {
      const longOutput = "x".repeat(20000);
      const t = tool({
        name: "verbose",
        description: "returns too much",
        parameters: z.object({}),
        maxOutputChars: 12000,
        execute: async () => longOutput,
      });

      const result = await t.call(mockRuntime, {});

      expect(result.success).toBe(true);
      expect(result.output.length).toBeLessThan(longOutput.length);
      expect(result.output).toContain("characters omitted");
    });

    it("should not truncate short output even when maxOutputChars is set", async () => {
      const t = tool({
        name: "concise",
        description: "short output",
        parameters: z.object({}),
        maxOutputChars: 12000,
        execute: async () => "short",
      });

      const result = await t.call(mockRuntime, {});

      expect(result.output).toBe("short");
    });

    it("should respect custom maxOutputChars value", async () => {
      const output = "x".repeat(200);
      const t = tool({
        name: "tiny",
        description: "small limit",
        parameters: z.object({}),
        maxOutputChars: 100,
        execute: async () => output,
      });

      const result = await t.call(mockRuntime, {});

      expect(result.output.length).toBeLessThan(200);
      expect(result.output).toContain("characters omitted");
    });
  });

  // --- type inference ---

  describe("type safety", () => {
    it("should infer execute parameter types from schema", async () => {
      // This test verifies compile-time type inference works.
      // If the types are wrong, this file won't compile.
      const t = tool({
        name: "typed",
        description: "typed tool",
        parameters: z.object({
          name: z.string(),
          age: z.number(),
          tags: z.array(z.string()).optional(),
        }),
        execute: async (input, _runtime) => {
          // TypeScript should infer these types:
          const _name: string = input.name;
          const _age: number = input.age;
          const _tags: string[] | undefined = input.tags;
          return `${_name} is ${_age}`;
        },
      });

      const result = await t.call(mockRuntime, { name: "Alice", age: 30 });
      expect(result.output).toBe("Alice is 30");
    });
  });
});
