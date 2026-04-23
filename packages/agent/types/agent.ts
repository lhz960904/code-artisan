import type { LLMProvider } from "./provider";
import type { Tool } from "../tools/tool";
import type { Message, NonSystemMessage } from "./messages";
import type { AgentMiddleware } from "./middleware";
import type { SkillFrontmatter } from "../middlewares/skills/skill-reader";
import type { Sandbox } from "../sandbox/types";

/**
 * The options for the ReactAgent.
 */
export interface AgentOptions {
  /** The system prompt to use to invoke the agent. */
  prompt?: string;
  /** The tools to use to invoke the agent. */
  tools?: Tool[];
  /** The LLM provider to use. */
  model: LLMProvider;
  /** The maximum number of steps to take. */
  maxSteps?: number;
  /** The LLM provider to use. */
  middlewares?: AgentMiddleware[];
  /** The directories to load skills from. default ~/.agents/skills */
  skillsDirs?: string[];
  /** The execution environment for built-in tools. Defaults to a new LocalSandbox. */
  sandbox?: Sandbox;
  /** The messages to resume from before the first `stream()` / `invoke()` call. */
  initMessages?: NonSystemMessage[];
}

/**
 * Runtime context injected into tool execute functions.
 * Provided by the agent loop at execution time, not at definition time.
 */
export interface AgentContext {
  /** The system prompt to use to invoke the agent. */
  prompt: string;
  /** The messages to use to invoke the agent. */
  messages: Message[];
  /** Main agent LLM (same as {@link AgentOptions.model}). Middleware may read this (e.g. auto-compact summary fallback). */
  model: LLMProvider;
  /** The tools to use to invoke the agent. */
  tools?: Tool[];
  /** The execution environment — same instance tools receive via ToolContext.
   *  Exposed to middlewares that need to read files, list dirs, or exec
   *  commands inside the sandbox (e.g. loading skills from a sandbox path). */
  sandbox: Sandbox;
  /** The skills to use to invoke the agent. */
  skills?: SkillFrontmatter[];
  /**
   * Cooperative stop signal. Middlewares set this to true to ask the agent
   * to exit after the current step. The Agent checks it at the top of each
   * step and at the end of tool execution, then returns cleanly (no throw).
   */
  shouldStop?: boolean;
}

/**
 * Ephemeral context created fresh from {@link AgentContext} for each model invocation.
 * Discarded after the model call completes, preventing accumulation across steps.
 */
export interface ModelContext {
  /** System prompt snapshot for this invocation. */
  prompt: string;
  /** Message history snapshot for this invocation. */
  messages: Message[];
  /** Tool definitions snapshot for this invocation. */
  tools?: Tool[];
}
