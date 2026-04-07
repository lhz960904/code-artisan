import { describe, it, expect } from "bun:test";
import * as z from "zod";
import { defineTool } from "./tool";

describe("defineTool()", () => {
  describe("definition", () => {
    it("should return a tool with name, description, and parameters", () => {
      const t = defineTool({
        name: "greet",
        description: "Say hello",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hello, ${name}!`,
      });

      expect(t.name).toBe("greet");
      expect(t.description).toBe("Say hello");
      expect(t.parameters).toBeDefined();
      expect(typeof t.invoke).toBe("function");
    });
  });

  describe("invoke()", () => {
    it("should execute with correct input", async () => {
      const t = defineTool({
        name: "greet",
        description: "Say hello",
        parameters: z.object({ name: z.string() }),
        invoke: async ({ name }) => `Hello, ${name}!`,
      });

      const result = await t.invoke({ name: "Alice" });
      expect(result).toBe("Hello, Alice!");
    });

    it("should propagate errors", async () => {
      const t = defineTool({
        name: "fail",
        description: "Always fails",
        parameters: z.object({}),
        invoke: async () => {
          throw new Error("boom");
        },
      });

      await expect(t.invoke({})).rejects.toThrow("boom");
    });
  });

  describe("type safety", () => {
    it("should infer invoke parameter types from schema", async () => {
      const t = defineTool({
        name: "typed",
        description: "typed tool",
        parameters: z.object({
          name: z.string(),
          age: z.number(),
          tags: z.array(z.string()).optional(),
        }),
        invoke: async (input) => {
          const _name: string = input.name;
          const _age: number = input.age;
          const _tags: string[] | undefined = input.tags;
          return `${_name} is ${_age}`;
        },
      });

      const result = await t.invoke({ name: "Alice", age: 30 });
      expect(result).toBe("Alice is 30");
    });
  });
});
