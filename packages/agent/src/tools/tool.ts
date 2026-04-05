import * as z from "zod";
import type { Tool } from "../providers/base";
import type { ToolRuntime, ToolCallResult } from "./types";

const MAX_OUTPUT_CHARS = 12000;
const HEAD_RATIO = 0.8;
const TAIL_RATIO = 0.2;

function truncateOutput(output: string, maxChars = MAX_OUTPUT_CHARS): string {
  if (output.length <= maxChars) return output;

  const headChars = Math.floor(maxChars * HEAD_RATIO);
  const tailChars = Math.floor(maxChars * TAIL_RATIO);
  const head = output.slice(0, headChars);
  const tail = output.slice(-tailChars);
  const omitted = output.length - headChars - tailChars;

  return `${head}\n\n[... ${omitted} characters omitted (${output.length} total) ...]\n\n${tail}`;
}

// ---- Types ----

interface ToolConfig<T extends z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  /** Max output characters before truncation. Disabled by default. */
  maxOutputChars?: number;
  execute?: (input: z.infer<T>, runtime: ToolRuntime) => Promise<string>;
}

export interface DefinedTool<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  execute?: (input: z.infer<T>, runtime: ToolRuntime) => Promise<string>;
  toToolDefinition(): Tool;
  call(runtime: ToolRuntime, rawInput: unknown): Promise<ToolCallResult>;
}

// ---- Implementation ----

export function tool<T extends z.ZodType>(config: ToolConfig<T>): DefinedTool<T> {
  const { name, description, parameters, maxOutputChars, execute } = config;

  return {
    name,
    description,
    parameters,
    execute,

    toToolDefinition(): Tool {
      const jsonSchema = z.toJSONSchema(parameters) as Record<string, unknown>;
      return {
        type: "function",
        function: {
          name,
          description,
          parameters: jsonSchema,
        },
      };
    },

    async call(runtime: ToolRuntime, rawInput: unknown): Promise<ToolCallResult> {
      if (!execute) {
        return { success: false, output: `Tool "${name}" has no execute function` };
      }

      // Validate input
      const parsed = parameters.safeParse(rawInput);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => i.message)
          .join(", ");
        return { success: false, output: `Validation error: ${issues}` };
      }

      // Execute with error catching
      try {
        let output = await execute(parsed.data, runtime);
        if (maxOutputChars != null) {
          output = truncateOutput(output, maxOutputChars);
        }
        return { success: true, output };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, output: `Tool error: ${message}` };
      }
    },
  };
}
