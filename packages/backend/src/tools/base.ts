import * as z from "zod";
import type { Sandbox } from "../sandbox/index.js";

/**
 * Tool execution runtime.
 * Provides sandbox access and conversation context to tool handlers.
 */
export interface ToolRuntime {
  sandbox: Sandbox;
  conversationId: string;
  // Reserved for future Agent refactoring: state, config, etc.
}

/**
 * Abstract base class for tools, aligned with LangChain StructuredTool pattern.
 * Subclasses define name, description, Zod schema, and implement _call().
 * BaseTool handles input validation, error catching, and JSON Schema conversion.
 */
export abstract class BaseTool<T extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  abstract name: string;
  abstract description: string;
  abstract schema: T;

  /** Subclass implements actual tool logic. Returns result as string. */
  protected abstract _call(runtime: ToolRuntime, input: z.infer<T>): Promise<string>;

  /** Public entry: validate input → execute → catch errors. */
  async call(runtime: ToolRuntime, rawInput: unknown): Promise<string> {
    const parsed = this.schema.safeParse(rawInput);
    if (!parsed.success) {
      return `Error: Invalid input - ${parsed.error.issues.map((i) => i.message).join(", ")}`;
    }
    try {
      return await this._call(runtime, parsed.data);
    } catch (err) {
      return `Error: ${String(err)}`;
    }
  }

  /** Convert to JSON Schema format for LLM consumption. */
  toJsonTool(): {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  } {
    const jsonSchema = z.toJSONSchema(this.schema) as Record<string, unknown>;
    return {
      name: this.name,
      description: this.description,
      input_schema: jsonSchema,
    };
  }
}
