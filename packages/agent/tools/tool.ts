import type { z } from "zod";
import type { Sandbox } from "../sandbox/types";

export interface ToolContext {
  /** Execution environment for built-in tools (bash, file ops, etc.). */
  sandbox: Sandbox;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

/**
 * A function tool that can be used to invoke a function.
 * @param P - The parameters of the tool.
 * @param R - The result of the tool.
 */
export interface FunctionTool<P extends z.ZodSchema<Record<string, unknown>> = z.ZodSchema<Record<string, unknown>>, R = unknown> {
  /** The name of the tool. */
  name: string;
  /** The description of the tool. */
  description: string;
  /** The parameters of the tool. */
  parameters: P;
  /** The function to invoke when the tool is called. */
  invoke: (input: z.infer<P>, context: ToolContext) => Promise<R>;
}

export type Tool = FunctionTool;

/**
 * Defines a function tool.
 */
export function defineTool<P extends z.ZodSchema<Record<string, unknown>>, R>({
  name,
  description,
  parameters,
  invoke,
}: {
  name: string;
  description: string;
  parameters: P;
  invoke: (input: z.infer<P>, context: ToolContext) => Promise<R>;
}): FunctionTool<P, R> {
  return { name, description, parameters, invoke } as FunctionTool<P, R>;
}
