import type { LLMProvider } from "./provider";
import type { Tool } from "../tools/tool";
import type { Message, NonSystemMessage } from "./messages";
import type { AgentMiddleware } from "./middleware";
import type { SkillFrontmatter } from "../middlewares/skills/skill-reader";

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
  /** The tools to use to invoke the agent. */
  tools?: Tool[];
  /** The skills to use to invoke the agent. */
  skills?: SkillFrontmatter[];
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
